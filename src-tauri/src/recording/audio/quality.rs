//! Signal-level health check of a recording: how loud the voice is, how loud
//! the background is, whether the input clipped, and whether the level moved
//! around (walking away from the mic). Answers "is it my mic, my gain, or my
//! distance?" with numbers, so the UI can suggest a fix.
//!
//! Levels are dBFS of 50 ms RMS frames. Speech level is the 90th percentile
//! of frames (the loud parts of talking), the noise floor is the 10th (the
//! pauses between words). Samples are consumed as a stream so an hour-long
//! recording never has to sit in memory.

use hound::{SampleFormat, WavReader};
use serde::{Deserialize, Serialize};
use std::path::Path;

const FRAME_SECONDS: f64 = 0.05;
/// Recordings shorter than this don't have enough pauses to judge noise.
const MIN_ANALYZED_SECONDS: f64 = 5.0;
const CLIP_LEVEL: f32 = 0.99;

/// Voice quieter than this sits close to the mic's own hiss and room noise.
const QUIET_SPEECH_DB: f64 = -42.0;
/// Voice-to-background margin below which accuracy starts to suffer.
const NOISY_SNR_DB: f64 = 20.0;
const POOR_SNR_DB: f64 = 12.0;
/// Share of clipped samples that indicates the gain is too high.
const CLIPPING_PERCENT: f64 = 0.05;
const POOR_CLIPPING_PERCENT: f64 = 0.5;
/// Spread between the loudest and quietest minute of speech.
const UNEVEN_LEVEL_DB: f64 = 12.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum QualityRating {
    Good,
    Fair,
    Poor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum QualityIssue {
    TooQuiet,
    Noisy,
    Clipping,
    UnevenLevel,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecordingQuality {
    pub speech_level_db: f64,
    pub noise_floor_db: f64,
    pub snr_db: f64,
    pub clipped_percent: f64,
    pub level_swing_db: f64,
    pub rating: QualityRating,
    pub issues: Vec<QualityIssue>,
}

/// Analyze a 16-bit or float WAV file. Returns `Ok(None)` when the recording
/// is too short to judge.
pub fn analyze_wav(path: &Path) -> Result<Option<RecordingQuality>, String> {
    let mut reader = WavReader::open(path)
        .map_err(|e| format!("Failed to open WAV at {}: {}", path.display(), e))?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;
    let mut acc = LevelAccumulator::new(spec.sample_rate);

    match spec.sample_format {
        SampleFormat::Float => {
            for (i, s) in reader.samples::<f32>().enumerate() {
                if i % channels == 0 {
                    acc.push(s.map_err(|e| e.to_string())?);
                }
            }
        }
        SampleFormat::Int => {
            let scale = (1i64 << (spec.bits_per_sample.saturating_sub(1))) as f32;
            for (i, s) in reader.samples::<i32>().enumerate() {
                if i % channels == 0 {
                    acc.push(s.map_err(|e| e.to_string())? as f32 / scale);
                }
            }
        }
    }
    Ok(acc.finish())
}

/// Analyze mono samples in memory. Tests use it to skip the WAV round trip.
#[cfg(test)]
pub fn analyze_samples(samples: &[f32], sample_rate: u32) -> Option<RecordingQuality> {
    let mut acc = LevelAccumulator::new(sample_rate);
    samples.iter().for_each(|&s| acc.push(s));
    acc.finish()
}

struct LevelAccumulator {
    frame_len: usize,
    frame_sum_sq: f64,
    frame_count: usize,
    frames_db: Vec<f64>,
    clipped: u64,
    total: u64,
    sample_rate: u32,
}

impl LevelAccumulator {
    fn new(sample_rate: u32) -> Self {
        Self {
            frame_len: ((sample_rate as f64 * FRAME_SECONDS) as usize).max(1),
            frame_sum_sq: 0.0,
            frame_count: 0,
            frames_db: Vec::new(),
            clipped: 0,
            total: 0,
            sample_rate,
        }
    }

    fn push(&mut self, sample: f32) {
        self.total += 1;
        if sample.abs() >= CLIP_LEVEL {
            self.clipped += 1;
        }
        self.frame_sum_sq += (sample as f64) * (sample as f64);
        self.frame_count += 1;
        if self.frame_count == self.frame_len {
            let rms = (self.frame_sum_sq / self.frame_len as f64).sqrt();
            self.frames_db.push(to_db(rms));
            self.frame_sum_sq = 0.0;
            self.frame_count = 0;
        }
    }

    fn finish(self) -> Option<RecordingQuality> {
        let seconds = self.total as f64 / self.sample_rate.max(1) as f64;
        if seconds < MIN_ANALYZED_SECONDS || self.frames_db.is_empty() {
            return None;
        }

        let speech_level_db = percentile(&self.frames_db, 0.9);
        let noise_floor_db = percentile(&self.frames_db, 0.1);
        let snr_db = speech_level_db - noise_floor_db;
        let clipped_percent = 100.0 * self.clipped as f64 / self.total as f64;
        let level_swing_db = per_minute_swing(&self.frames_db);

        let issues = find_issues(speech_level_db, snr_db, clipped_percent, level_swing_db);
        let rating = rate(snr_db, clipped_percent, &issues);

        Some(RecordingQuality {
            speech_level_db: round1(speech_level_db),
            noise_floor_db: round1(noise_floor_db),
            snr_db: round1(snr_db),
            clipped_percent: (clipped_percent * 1000.0).round() / 1000.0,
            level_swing_db: round1(level_swing_db),
            rating,
            issues,
        })
    }
}

fn find_issues(speech_db: f64, snr_db: f64, clipped_percent: f64, swing_db: f64) -> Vec<QualityIssue> {
    let mut issues = Vec::new();
    if speech_db < QUIET_SPEECH_DB {
        issues.push(QualityIssue::TooQuiet);
    }
    if snr_db < NOISY_SNR_DB {
        issues.push(QualityIssue::Noisy);
    }
    if clipped_percent > CLIPPING_PERCENT {
        issues.push(QualityIssue::Clipping);
    }
    if swing_db > UNEVEN_LEVEL_DB {
        issues.push(QualityIssue::UnevenLevel);
    }
    issues
}

fn rate(snr_db: f64, clipped_percent: f64, issues: &[QualityIssue]) -> QualityRating {
    if snr_db < POOR_SNR_DB || clipped_percent > POOR_CLIPPING_PERCENT {
        QualityRating::Poor
    } else if issues.is_empty() {
        QualityRating::Good
    } else {
        QualityRating::Fair
    }
}

/// Spread of the speech level across whole minutes: walking away from the
/// mic shows up as some minutes being much quieter than others.
fn per_minute_swing(frames_db: &[f64]) -> f64 {
    let frames_per_minute = (60.0 / FRAME_SECONDS) as usize;
    let minute_levels: Vec<f64> = frames_db
        .chunks(frames_per_minute)
        .filter(|chunk| chunk.len() == frames_per_minute)
        .map(|chunk| percentile(chunk, 0.9))
        .collect();
    if minute_levels.len() < 3 {
        return 0.0;
    }
    // Ignore the single loudest and quietest minute (a cough, a long pause).
    let mut sorted = minute_levels;
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let trimmed = if sorted.len() >= 5 { &sorted[1..sorted.len() - 1] } else { &sorted[..] };
    trimmed[trimmed.len() - 1] - trimmed[0]
}

fn percentile(values: &[f64], q: f64) -> f64 {
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    sorted[((sorted.len() - 1) as f64 * q).round() as usize]
}

fn to_db(rms: f64) -> f64 {
    if rms <= 1e-6 {
        -120.0
    } else {
        20.0 * rms.log10()
    }
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 16_000;

    /// Alternating "speech" bursts and "pauses": a sine at `speech_amp` for
    /// 0.6 s, then noise-like low signal at `noise_amp` for 0.4 s.
    fn talk(seconds: f64, speech_amp: f32, noise_amp: f32) -> Vec<f32> {
        let n = (seconds * RATE as f64) as usize;
        (0..n)
            .map(|i| {
                let t = i as f32 / RATE as f32;
                let in_speech = (t % 1.0) < 0.6;
                let amp = if in_speech { speech_amp } else { noise_amp };
                // Pseudo-random sign keeps the "noise" from being a pure tone.
                let wobble = if (i * 7919) % 13 < 6 { 1.0 } else { -1.0 };
                amp * (t * 2.0 * std::f32::consts::PI * 220.0).sin().abs() * wobble
            })
            .collect()
    }

    #[test]
    fn test_too_short_recording_is_not_rated() {
        assert_eq!(analyze_samples(&talk(2.0, 0.3, 0.001), RATE), None);
    }

    #[test]
    fn test_close_clean_voice_is_good() {
        let q = analyze_samples(&talk(30.0, 0.2, 0.002), RATE).unwrap();
        assert_eq!(q.rating, QualityRating::Good, "{:?}", q);
        assert!(q.issues.is_empty());
        assert!(q.snr_db > 30.0);
    }

    #[test]
    fn test_quiet_voice_is_flagged() {
        let q = analyze_samples(&talk(30.0, 0.006, 0.0001), RATE).unwrap();
        assert!(q.issues.contains(&QualityIssue::TooQuiet), "{:?}", q);
    }

    #[test]
    fn test_loud_background_is_noisy_or_poor() {
        let q = analyze_samples(&talk(30.0, 0.1, 0.05), RATE).unwrap();
        assert!(q.issues.contains(&QualityIssue::Noisy), "{:?}", q);
        assert_eq!(q.rating, QualityRating::Poor);
    }

    #[test]
    fn test_clipping_is_flagged() {
        let mut samples = talk(30.0, 0.2, 0.002);
        for s in samples.iter_mut().step_by(100) {
            *s = 1.0;
        }
        let q = analyze_samples(&samples, RATE).unwrap();
        assert!(q.issues.contains(&QualityIssue::Clipping), "{:?}", q);
        assert_eq!(q.rating, QualityRating::Poor);
    }

    #[test]
    fn test_walking_away_from_the_mic_is_uneven() {
        let mut samples = Vec::new();
        for minute in 0..6 {
            let amp = if minute % 2 == 0 { 0.3 } else { 0.03 };
            samples.extend(talk(60.0, amp, 0.0005));
        }
        let q = analyze_samples(&samples, RATE).unwrap();
        assert!(q.issues.contains(&QualityIssue::UnevenLevel), "{:?}", q);
    }

    #[test]
    fn test_analyze_wav_matches_in_memory_analysis() {
        use crate::recording::audio::write_wav_file;
        let samples = talk(10.0, 0.2, 0.002);
        let mut path = std::env::temp_dir();
        path.push(format!("thoughtcast_quality_test_{}.wav", std::process::id()));
        write_wav_file(&samples, &path, RATE).unwrap();

        let from_file = analyze_wav(&path).unwrap().unwrap();
        let in_memory = analyze_samples(&samples, RATE).unwrap();
        let _ = std::fs::remove_file(&path);

        assert!((from_file.speech_level_db - in_memory.speech_level_db).abs() < 0.5);
        assert_eq!(from_file.rating, in_memory.rating);
    }
}

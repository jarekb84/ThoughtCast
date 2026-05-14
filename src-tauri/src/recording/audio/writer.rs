use hound::{WavReader, WavSpec, WavWriter};
use std::path::Path;

/// Write F32 audio samples to a 16-bit mono WAV file.
///
/// `sample_rate` MUST match the rate the samples were captured at — labelling
/// the file with a different rate (e.g. hard-coding 44.1 kHz while CPAL
/// captured at 48 kHz) time-stretches playback and silently truncates the
/// chunked transcription's view of the audio.
pub fn write_wav_file(
    samples: &[f32],
    output_path: &Path,
    sample_rate: u32,
) -> Result<(), String> {
    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = WavWriter::create(output_path, spec)
        .map_err(|e| format!("Failed to create WAV file: {}", e))?;

    // Convert F32 samples to I16
    for &sample in samples {
        let amplitude = i16::MAX as f32;
        writer
            .write_sample((sample * amplitude) as i16)
            .map_err(|e| format!("Failed to write sample: {}", e))?;
    }

    writer
        .finalize()
        .map_err(|e| format!("Failed to finalize WAV file: {}", e))?;

    Ok(())
}

/// Read the WAV header at `wav_path` and return its apparent playback duration
/// in seconds (frames / sample_rate).
///
/// Used by retranscribe to drive chunk planning off the audio file's real
/// timeline rather than the wall-clock `session.duration`. The two diverge
/// for pre-fix recordings whose WAV/M4A headers were mislabelled.
pub fn read_wav_duration_seconds(wav_path: &Path) -> Result<f64, String> {
    let reader = WavReader::open(wav_path)
        .map_err(|e| format!("Failed to open WAV at {}: {}", wav_path.display(), e))?;
    let spec = reader.spec();
    if spec.sample_rate == 0 {
        return Err(format!(
            "WAV header reports a zero sample rate at: {}",
            wav_path.display()
        ));
    }
    // `WavReader::duration()` is "samples per channel" — i.e. frames. Dividing
    // by sample_rate gives wall-clock seconds of playback at the labelled rate.
    let frames = reader.duration() as f64;
    Ok(frames / spec.sample_rate as f64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_path(name: &str) -> std::path::PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("thoughtcast_writer_test_{}_{}.wav", std::process::id(), name));
        p
    }

    #[test]
    fn test_write_wav_file_records_passed_sample_rate_in_header() {
        let path = temp_path("48k");
        let samples = vec![0.0f32; 48_000]; // 1 second at 48 kHz
        write_wav_file(&samples, &path, 48_000).expect("write should succeed");

        let reader = WavReader::open(&path).expect("read should succeed");
        let spec = reader.spec();
        assert_eq!(spec.sample_rate, 48_000);
        assert_eq!(spec.channels, 1);
        assert_eq!(spec.bits_per_sample, 16);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_read_wav_duration_seconds_matches_sample_count_over_rate() {
        let path = temp_path("48k_2s");
        // 2 seconds of silence at 48 kHz → 96000 frames
        let samples = vec![0.0f32; 96_000];
        write_wav_file(&samples, &path, 48_000).expect("write should succeed");

        let duration = read_wav_duration_seconds(&path).expect("read should succeed");
        assert!(
            (duration - 2.0).abs() < 0.001,
            "expected ~2.0s, got {}",
            duration
        );

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_read_wav_duration_seconds_errors_on_missing_file() {
        let err = read_wav_duration_seconds(Path::new(
            "/definitely/does/not/exist/thoughtcast_missing.wav",
        ))
        .unwrap_err();
        assert!(err.contains("Failed to open WAV"));
    }
}

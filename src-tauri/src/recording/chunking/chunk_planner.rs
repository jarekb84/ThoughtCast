//! Pure planning logic: given the audio duration and silences detected within
//! it, decide where to cut the WAV. Kept free of FFmpeg / filesystem concerns
//! so the planning policy is straightforwardly unit-testable.

use serde::Serialize;

/// A range of audio time (seconds) where FFmpeg's `silencedetect` reported
/// the signal stayed under the configured threshold.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SilenceRange {
    pub start_sec: f64,
    pub end_sec: f64,
}

/// One chunk to feed to Whisper. End-exclusive.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct ChunkSpec {
    pub start_sec: f64,
    pub end_sec: f64,
}

/// Output of the planner. `used_fallback` is set when the planner had to cut
/// at the max-window boundary because no silence was found in the target
/// range — the user can be warned the seam may be rougher than usual.
#[derive(Debug, Clone, PartialEq)]
pub struct ChunkPlan {
    pub chunks: Vec<ChunkSpec>,
    pub used_fallback: bool,
}

/// Lead-in (seconds) the planner adds after the silence end so the next chunk
/// starts on speech rather than at the tail of the silence. Small — just
/// enough that Whisper doesn't see a hard transition at sample 0.
///
/// Per the PRD: "Each new chunk starts a fraction of a second after the
/// silence ends, giving the model lead-in context". 50ms is enough to avoid
/// landing exactly on the silence-end sample but short enough that the
/// previous chunk's tail still carries the trailing phoneme if any.
const LEAD_IN_AFTER_SILENCE_SEC: f64 = 0.05;

/// Decide chunk boundaries for a recording.
///
/// Rules:
/// * `audio_duration_sec` < `min_chunk_duration_sec` → single chunk equal to
///   the whole recording. Chunking is a no-op for short recordings.
/// * Otherwise walk the recording: for each cursor position, look in the
///   `[cursor + min, cursor + max]` window for the *latest* silence whose
///   start falls inside the window. Cut at silence start, resume the next
///   chunk at silence end + lead-in.
/// * If no silence sits in the window, fall back to a hard cut at
///   `cursor + max` and flag `used_fallback`.
pub fn plan_cuts(
    audio_duration_sec: f64,
    silences: &[SilenceRange],
    min_chunk_duration_sec: f64,
    max_chunk_duration_sec: f64,
) -> ChunkPlan {
    if audio_duration_sec <= 0.0 {
        return ChunkPlan {
            chunks: Vec::new(),
            used_fallback: false,
        };
    }

    // Sanity: invalid config (max <= min) collapses to a single chunk so we
    // never produce an infinite loop. Validation upstream should already
    // prevent this, but defending in depth.
    if max_chunk_duration_sec <= min_chunk_duration_sec
        || audio_duration_sec < min_chunk_duration_sec
    {
        return ChunkPlan {
            chunks: vec![ChunkSpec {
                start_sec: 0.0,
                end_sec: audio_duration_sec,
            }],
            used_fallback: false,
        };
    }

    let mut chunks: Vec<ChunkSpec> = Vec::new();
    let mut cursor = 0.0_f64;
    let mut used_fallback = false;

    while audio_duration_sec - cursor > max_chunk_duration_sec {
        let window_lo = cursor + min_chunk_duration_sec;
        let window_hi = cursor + max_chunk_duration_sec;

        let candidate = silences
            .iter()
            .filter(|s| s.start_sec >= window_lo && s.start_sec <= window_hi)
            // Prefer the latest silence in the window — gives the model the
            // most speech context per chunk while staying under the max.
            .max_by(|a, b| {
                a.start_sec
                    .partial_cmp(&b.start_sec)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

        match candidate {
            Some(silence) => {
                chunks.push(ChunkSpec {
                    start_sec: cursor,
                    end_sec: silence.start_sec,
                });
                cursor = (silence.end_sec + LEAD_IN_AFTER_SILENCE_SEC)
                    .min(audio_duration_sec);
            }
            None => {
                // No silence in window — hard-cut at max and warn.
                chunks.push(ChunkSpec {
                    start_sec: cursor,
                    end_sec: window_hi,
                });
                cursor = window_hi;
                used_fallback = true;
            }
        }
    }

    // Final tail: whatever remains after the last cut goes in one chunk.
    if cursor < audio_duration_sec {
        chunks.push(ChunkSpec {
            start_sec: cursor,
            end_sec: audio_duration_sec,
        });
    }

    ChunkPlan {
        chunks,
        used_fallback,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn silence(start: f64, end: f64) -> SilenceRange {
        SilenceRange {
            start_sec: start,
            end_sec: end,
        }
    }

    #[test]
    fn test_plan_short_audio_returns_single_chunk() {
        let plan = plan_cuts(120.0, &[], 420.0, 600.0);
        assert_eq!(plan.chunks.len(), 1);
        assert_eq!(plan.chunks[0].start_sec, 0.0);
        assert_eq!(plan.chunks[0].end_sec, 120.0);
        assert!(!plan.used_fallback);
    }

    #[test]
    fn test_plan_zero_duration_returns_no_chunks() {
        let plan = plan_cuts(0.0, &[], 420.0, 600.0);
        assert!(plan.chunks.is_empty());
        assert!(!plan.used_fallback);
    }

    #[test]
    fn test_plan_uses_silence_within_window() {
        // 25-min recording, silences at 8min and 17min (in window).
        let silences = vec![silence(8.0 * 60.0, 8.5 * 60.0), silence(17.0 * 60.0, 17.4 * 60.0)];
        let plan = plan_cuts(25.0 * 60.0, &silences, 420.0, 600.0);

        assert_eq!(plan.chunks.len(), 3);
        assert!(!plan.used_fallback);

        // First chunk: 0 → silence_start (8min)
        assert_eq!(plan.chunks[0].start_sec, 0.0);
        assert!((plan.chunks[0].end_sec - 8.0 * 60.0).abs() < 0.001);

        // Second chunk starts at silence_end + lead-in (~8.5min + 0.05s)
        assert!((plan.chunks[1].start_sec - (8.5 * 60.0 + LEAD_IN_AFTER_SILENCE_SEC)).abs() < 0.001);
        assert!((plan.chunks[1].end_sec - 17.0 * 60.0).abs() < 0.001);

        // Third chunk runs to end
        assert!((plan.chunks[2].end_sec - 25.0 * 60.0).abs() < 0.001);
    }

    #[test]
    fn test_plan_falls_back_to_hard_cut_when_no_silence_in_window() {
        // 15-min recording with one continuous monologue — no silence at all.
        let plan = plan_cuts(15.0 * 60.0, &[], 420.0, 600.0);

        // Should split at max (10min) then carry the 5-min remainder.
        assert_eq!(plan.chunks.len(), 2);
        assert!(plan.used_fallback);
        assert!((plan.chunks[0].end_sec - 600.0).abs() < 0.001);
        assert!((plan.chunks[1].start_sec - 600.0).abs() < 0.001);
        assert!((plan.chunks[1].end_sec - 900.0).abs() < 0.001);
    }

    #[test]
    fn test_plan_ignores_silences_outside_window() {
        // Silence at 5min (before min=7min) and one at 11min (after max=10min).
        // Neither is usable for the first cut — must fall back.
        let silences = vec![silence(5.0 * 60.0, 5.2 * 60.0), silence(11.0 * 60.0, 11.2 * 60.0)];
        let plan = plan_cuts(20.0 * 60.0, &silences, 420.0, 600.0);

        assert!(plan.used_fallback, "first cut should fall back");
        assert!(
            (plan.chunks[0].end_sec - 600.0).abs() < 0.001,
            "first cut should be at max"
        );
    }

    #[test]
    fn test_plan_prefers_latest_silence_in_window() {
        // Two silences inside the [7min, 10min] window — planner should pick
        // the later one to maximize speech-per-chunk. We only assert on the
        // FIRST cut here; whether the tail needs a fallback later depends on
        // unrelated tail silences and is covered separately.
        let silences = vec![silence(7.5 * 60.0, 7.6 * 60.0), silence(9.5 * 60.0, 9.6 * 60.0)];
        let plan = plan_cuts(20.0 * 60.0, &silences, 420.0, 600.0);

        assert!(
            (plan.chunks[0].end_sec - 9.5 * 60.0).abs() < 0.001,
            "expected first cut at 9.5min (latest silence), got {}",
            plan.chunks[0].end_sec
        );
    }

    #[test]
    fn test_plan_applies_lead_in_offset_after_silence_end() {
        let silences = vec![silence(8.0 * 60.0, 9.0 * 60.0)]; // 1-min silence
        let plan = plan_cuts(20.0 * 60.0, &silences, 420.0, 600.0);

        // Second chunk should start at 9min + 50ms (lead-in), not 9min flat.
        let expected_start = 9.0 * 60.0 + LEAD_IN_AFTER_SILENCE_SEC;
        assert!((plan.chunks[1].start_sec - expected_start).abs() < 0.001);
    }

    #[test]
    fn test_plan_handles_multiple_chunks_for_very_long_audio() {
        // 27-min recording with regular silences every ~8 minutes. After the
        // third cut at 24min the remaining ~3min fits inside one tail chunk
        // without needing a fallback.
        let silences = vec![
            silence(8.0 * 60.0, 8.1 * 60.0),
            silence(16.0 * 60.0, 16.1 * 60.0),
            silence(24.0 * 60.0, 24.1 * 60.0),
        ];
        let plan = plan_cuts(27.0 * 60.0, &silences, 420.0, 600.0);

        assert!(!plan.used_fallback);
        assert_eq!(plan.chunks.len(), 4);
        assert!((plan.chunks[0].end_sec - 8.0 * 60.0).abs() < 0.001);
        assert!((plan.chunks[1].end_sec - 16.0 * 60.0).abs() < 0.001);
        assert!((plan.chunks[2].end_sec - 24.0 * 60.0).abs() < 0.001);
        assert!((plan.chunks[3].end_sec - 27.0 * 60.0).abs() < 0.001);
    }

    #[test]
    fn test_plan_invalid_config_collapses_to_single_chunk() {
        // max < min — defend in depth (UI validation should already block this).
        let plan = plan_cuts(1200.0, &[], 600.0, 300.0);
        assert_eq!(plan.chunks.len(), 1);
        assert_eq!(plan.chunks[0].end_sec, 1200.0);
        assert!(!plan.used_fallback);
    }
}

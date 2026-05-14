//! Detects silence ranges in a WAV file by invoking
//! `ffmpeg -af silencedetect=noise=<dB>:d=<sec> -f null -` and parsing the
//! `silence_start` / `silence_end` markers FFmpeg writes to stderr.

use super::chunk_planner::SilenceRange;
use super::errors::ChunkingError;
use crate::recording::utils::apply_no_console_window;
use std::path::Path;
use std::process::Command;

/// Run silence detection on `wav_path` and return the detected ranges.
///
/// `threshold_db` is the `noise=` parameter (typically negative — quieter
/// than the threshold counts as silence). `min_silence_duration_sec` is the
/// `d=` parameter (the shortest run that qualifies).
pub fn detect_silences(
    ffmpeg_path: &str,
    wav_path: &Path,
    threshold_db: f64,
    min_silence_duration_sec: f64,
) -> Result<Vec<SilenceRange>, ChunkingError> {
    if ffmpeg_path.trim().is_empty() {
        return Err(ChunkingError::FfmpegMissing {
            message: "FFmpeg path is not configured".to_string(),
        });
    }
    if !Path::new(ffmpeg_path).exists() {
        return Err(ChunkingError::FfmpegMissing {
            message: format!("FFmpeg binary not found at: {}", ffmpeg_path),
        });
    }
    if !wav_path.exists() {
        return Err(ChunkingError::Io {
            message: format!("Source WAV not found: {}", wav_path.display()),
        });
    }

    let output = build_silencedetect_command(
        ffmpeg_path,
        wav_path,
        threshold_db,
        min_silence_duration_sec,
    )
    .output()
    .map_err(|e| ChunkingError::FfmpegFailed {
        message: format!("Could not launch FFmpeg for silence detection: {}", e),
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ChunkingError::FfmpegFailed {
            message: format!("FFmpeg silencedetect exited with error: {}", stderr.trim()),
        });
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Ok(parse_silencedetect_stderr(&stderr))
}

fn build_silencedetect_command(
    ffmpeg_path: &str,
    wav_path: &Path,
    threshold_db: f64,
    min_silence_duration_sec: f64,
) -> Command {
    let filter = format!(
        "silencedetect=noise={}dB:d={}",
        threshold_db, min_silence_duration_sec
    );

    let mut cmd = Command::new(ffmpeg_path);
    cmd.arg("-hide_banner")
        .arg("-nostats")
        .arg("-i")
        .arg(wav_path)
        .arg("-af")
        .arg(&filter)
        // No audio output — we only care about the filter's stderr markers.
        .arg("-f")
        .arg("null")
        .arg("-");

    apply_no_console_window(&mut cmd);
    cmd
}

/// Parse FFmpeg `silencedetect` stderr lines like:
///   `[silencedetect @ 0x...] silence_start: 12.345`
///   `[silencedetect @ 0x...] silence_end: 13.012 | silence_duration: 0.667`
///
/// Pairs them into `SilenceRange`s. Unmatched `silence_start` markers
/// (silence that runs to end-of-file) are dropped — they can't be used as
/// cut points anyway.
fn parse_silencedetect_stderr(stderr: &str) -> Vec<SilenceRange> {
    let mut ranges: Vec<SilenceRange> = Vec::new();
    let mut pending_start: Option<f64> = None;

    for line in stderr.lines() {
        if let Some(start) = extract_marker(line, "silence_start:") {
            pending_start = Some(start);
        } else if let Some(end) = extract_marker(line, "silence_end:") {
            if let Some(start) = pending_start.take() {
                if end > start {
                    ranges.push(SilenceRange {
                        start_sec: start,
                        end_sec: end,
                    });
                }
            }
        }
    }

    ranges
}

/// Extract the floating-point value that follows `marker` on a stderr line.
/// Returns `None` if the marker isn't present or the value doesn't parse.
fn extract_marker(line: &str, marker: &str) -> Option<f64> {
    let idx = line.find(marker)?;
    let rest = &line[idx + marker.len()..];
    let token = rest.split_whitespace().next()?;
    token.parse::<f64>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_single_silence_pair() {
        let stderr = "\
[silencedetect @ 0x55aa] silence_start: 12.345
[silencedetect @ 0x55aa] silence_end: 13.012 | silence_duration: 0.667
";
        let ranges = parse_silencedetect_stderr(stderr);
        assert_eq!(ranges.len(), 1);
        assert!((ranges[0].start_sec - 12.345).abs() < 0.0001);
        assert!((ranges[0].end_sec - 13.012).abs() < 0.0001);
    }

    #[test]
    fn test_parse_multiple_silences_in_order() {
        let stderr = "\
[silencedetect] silence_start: 5.0
[silencedetect] silence_end: 5.5 | silence_duration: 0.5
random noise output from ffmpeg
[silencedetect] silence_start: 480.123
[silencedetect] silence_end: 481.0 | silence_duration: 0.877
";
        let ranges = parse_silencedetect_stderr(stderr);
        assert_eq!(ranges.len(), 2);
        assert!((ranges[1].start_sec - 480.123).abs() < 0.0001);
    }

    #[test]
    fn test_parse_drops_unmatched_silence_start() {
        // Recording ends mid-silence — silencedetect emits only `silence_start`.
        let stderr = "[silencedetect] silence_start: 600.0\n";
        let ranges = parse_silencedetect_stderr(stderr);
        assert!(ranges.is_empty());
    }

    #[test]
    fn test_parse_handles_empty_stderr() {
        let ranges = parse_silencedetect_stderr("");
        assert!(ranges.is_empty());
    }

    #[test]
    fn test_parse_ignores_zero_or_negative_duration() {
        // Bogus data shouldn't crash — silence_end before silence_start.
        let stderr = "\
[silencedetect] silence_start: 12.0
[silencedetect] silence_end: 11.0 | silence_duration: -1.0
";
        let ranges = parse_silencedetect_stderr(stderr);
        assert!(ranges.is_empty());
    }

    #[test]
    fn test_build_command_contains_filter_and_null_output() {
        let cmd = build_silencedetect_command(
            "/usr/bin/ffmpeg",
            Path::new("/tmp/test.wav"),
            -35.0,
            0.5,
        );
        let args: Vec<String> = cmd
            .get_args()
            .map(|s| s.to_string_lossy().to_string())
            .collect();

        let filter_idx = args.iter().position(|a| a == "-af").expect("missing -af");
        let filter = &args[filter_idx + 1];
        assert!(filter.contains("silencedetect"));
        assert!(filter.contains("noise=-35dB"));
        assert!(filter.contains("d=0.5"));

        // Output is null format on stdout
        assert!(args.iter().any(|a| a == "null"));
        assert!(args.iter().any(|a| a == "-"));
    }

    #[test]
    fn test_detect_returns_error_for_empty_ffmpeg_path() {
        let err = detect_silences("", Path::new("/tmp/x.wav"), -35.0, 0.5).unwrap_err();
        match err {
            ChunkingError::FfmpegMissing { .. } => {}
            other => panic!("expected FfmpegMissing, got {:?}", other),
        }
    }

    #[test]
    fn test_detect_returns_error_for_nonexistent_ffmpeg() {
        let err = detect_silences(
            "/definitely/does/not/exist/ffmpeg",
            Path::new("/tmp/x.wav"),
            -35.0,
            0.5,
        )
        .unwrap_err();
        match err {
            ChunkingError::FfmpegMissing { .. } => {}
            other => panic!("expected FfmpegMissing, got {:?}", other),
        }
    }
}

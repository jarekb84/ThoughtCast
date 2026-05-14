//! Decode an arbitrary audio file (e.g. M4A from post-transcription
//! compression) to a temporary 16 kHz mono PCM WAV that whisper.cpp can
//! consume directly. Used by the retranscribe path so a compressed session
//! can be re-run through the same transcription flow — single-shot or
//! chunked — as a fresh recording.

use crate::recording::utils::apply_no_console_window;
use std::path::Path;
use std::process::Command;

/// Decode `source` to a 16 kHz mono PCM WAV at `dest_wav` using FFmpeg.
///
/// The output format mirrors the recording pipeline (16 kHz mono PCM s16le)
/// so the chunked path's per-chunk slice does not need to re-resample and
/// whisper.cpp gets the format it expects without any further conversion.
pub fn decode_to_wav(
    ffmpeg_path: &str,
    source: &Path,
    dest_wav: &Path,
) -> Result<(), String> {
    if ffmpeg_path.trim().is_empty() {
        return Err(
            "FFmpeg path is not configured — cannot decode compressed audio for retranscription"
                .to_string(),
        );
    }
    if !Path::new(ffmpeg_path).exists() {
        return Err(format!("FFmpeg binary not found at: {}", ffmpeg_path));
    }
    if !source.exists() {
        return Err(format!("Source audio not found: {}", source.display()));
    }

    let output = build_decode_command(ffmpeg_path, source, dest_wav)
        .output()
        .map_err(|e| format!("Could not launch FFmpeg to decode audio: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg failed to decode audio: {}", stderr.trim()));
    }

    if !dest_wav.exists() {
        return Err(format!(
            "FFmpeg reported success but no decoded WAV was produced at: {}",
            dest_wav.display()
        ));
    }

    Ok(())
}

fn build_decode_command(ffmpeg_path: &str, source: &Path, dest_wav: &Path) -> Command {
    let mut cmd = Command::new(ffmpeg_path);
    cmd.arg("-y")
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(source)
        .arg("-ar")
        .arg("16000")
        .arg("-ac")
        .arg("1")
        .arg("-c:a")
        .arg("pcm_s16le")
        .arg(dest_wav);

    apply_no_console_window(&mut cmd);
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_decode_returns_error_for_empty_ffmpeg_path() {
        let src = PathBuf::from("/tmp/whatever.m4a");
        let dst = PathBuf::from("/tmp/whatever.wav");
        let err = decode_to_wav("", &src, &dst).unwrap_err();
        assert!(err.contains("FFmpeg path is not configured"));
    }

    #[test]
    fn test_decode_returns_error_for_nonexistent_ffmpeg_binary() {
        let src = PathBuf::from("/tmp/whatever.m4a");
        let dst = PathBuf::from("/tmp/whatever.wav");
        let err = decode_to_wav("/definitely/missing/ffmpeg", &src, &dst).unwrap_err();
        assert!(err.contains("FFmpeg binary not found"));
    }

    #[test]
    fn test_build_decode_command_emits_pcm_16k_mono_args() {
        let cmd = build_decode_command(
            "/usr/bin/ffmpeg",
            Path::new("/tmp/in.m4a"),
            Path::new("/tmp/out.wav"),
        );
        let args: Vec<String> = cmd
            .get_args()
            .map(|s| s.to_string_lossy().to_string())
            .collect();

        assert!(args.iter().any(|a| a == "16000"));
        assert!(args.iter().any(|a| a == "pcm_s16le"));

        let ac_idx = args.iter().position(|a| a == "-ac").expect("missing -ac");
        assert_eq!(args[ac_idx + 1], "1");

        let i_idx = args.iter().position(|a| a == "-i").expect("missing -i");
        assert_eq!(args[i_idx + 1], "/tmp/in.m4a");
    }
}

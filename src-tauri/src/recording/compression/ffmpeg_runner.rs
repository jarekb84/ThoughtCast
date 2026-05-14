use super::errors::CompressionError;
use crate::recording::utils::apply_no_console_window;
use std::path::Path;
use std::process::Command;

/// Run FFmpeg to convert a WAV file at `wav_path` into an M4A (AAC) file at
/// `m4a_temp_path`. `m4a_temp_path` is expected to be a temp location — the
/// caller is responsible for the atomic-move step (see `atomic_replace`).
///
/// Settings: AAC at 64 kbps with `+faststart` for fast playback seek. Good
/// quality for voice while delivering the ~10x size reduction the PRD targets.
pub fn compress_wav_to_m4a(
    ffmpeg_path: &str,
    wav_path: &Path,
    m4a_temp_path: &Path,
) -> Result<(), CompressionError> {
    if ffmpeg_path.trim().is_empty() {
        return Err(CompressionError::FfmpegMissing {
            message: "FFmpeg path is not configured".to_string(),
        });
    }

    if !Path::new(ffmpeg_path).exists() {
        return Err(CompressionError::FfmpegMissing {
            message: format!("FFmpeg binary not found at: {}", ffmpeg_path),
        });
    }

    if !wav_path.exists() {
        return Err(CompressionError::Io {
            message: format!("Source WAV not found: {}", wav_path.display()),
        });
    }

    let output_result = build_ffmpeg_command(ffmpeg_path, wav_path, m4a_temp_path).output();

    let output = output_result.map_err(|e| CompressionError::FfmpegFailed {
        message: format!("Could not launch FFmpeg: {}", e),
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(CompressionError::FfmpegFailed {
            message: format!("FFmpeg exited with error: {}", stderr.trim()),
        });
    }

    if !m4a_temp_path.exists() {
        return Err(CompressionError::Verification {
            message: "FFmpeg reported success but no output file was produced".to_string(),
        });
    }

    // Sanity check that the output isn't a zero-byte placeholder. A real
    // AAC/M4A file should always be more than a few bytes for any non-empty
    // WAV. The exact threshold isn't important — 1KB rules out empty/header-only.
    let metadata = std::fs::metadata(m4a_temp_path).map_err(CompressionError::from)?;
    if metadata.len() < 1024 {
        return Err(CompressionError::Verification {
            message: format!(
                "Compressed file is suspiciously small ({} bytes) — refusing to replace",
                metadata.len()
            ),
        });
    }

    Ok(())
}

fn build_ffmpeg_command(ffmpeg_path: &str, wav_path: &Path, m4a_temp_path: &Path) -> Command {
    let mut cmd = Command::new(ffmpeg_path);
    cmd.arg("-y") // overwrite output if it exists (temp path, safe)
        .arg("-i")
        .arg(wav_path)
        .arg("-c:a")
        .arg("aac")
        .arg("-b:a")
        .arg("64k")
        .arg("-movflags")
        .arg("+faststart")
        // Force the M4A/MP4 muxer explicitly. We write to a `*.m4a.tmp` path
        // and rename to `.m4a` atomically after verification; FFmpeg can't
        // infer the format from the `.tmp` extension, so we tell it.
        .arg("-f")
        .arg("ipod")
        .arg(m4a_temp_path);

    apply_no_console_window(&mut cmd);
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_compress_returns_error_for_empty_ffmpeg_path() {
        let wav = PathBuf::from("/tmp/whatever.wav");
        let m4a = PathBuf::from("/tmp/whatever.m4a.tmp");
        let err = compress_wav_to_m4a("", &wav, &m4a).unwrap_err();
        match err {
            CompressionError::FfmpegMissing { message } => {
                assert!(message.contains("not configured"));
            }
            other => panic!("expected FfmpegMissing, got {:?}", other),
        }
    }

    #[test]
    fn test_compress_returns_error_for_nonexistent_ffmpeg_binary() {
        let wav = PathBuf::from("/tmp/whatever.wav");
        let m4a = PathBuf::from("/tmp/whatever.m4a.tmp");
        let err = compress_wav_to_m4a(
            "/definitely/does/not/exist/ffmpeg",
            &wav,
            &m4a,
        )
        .unwrap_err();
        match err {
            CompressionError::FfmpegMissing { .. } => {}
            other => panic!("expected FfmpegMissing, got {:?}", other),
        }
    }
}

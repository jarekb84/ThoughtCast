//! Splits a source WAV into per-chunk WAVs at the time offsets the planner
//! produced. Re-encodes to PCM s16le 16kHz mono so each chunk matches what
//! Whisper.cpp expects (the recording pipeline already writes 16kHz mono,
//! but the explicit `-ar 16000 -ac 1` makes the chunk path tolerant of any
//! future format drift).

use super::chunk_planner::ChunkSpec;
use super::errors::ChunkingError;
use crate::recording::utils::apply_no_console_window;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Write each chunk in `chunks` to a separate WAV file under `output_dir`.
/// Files are named `chunk_000.wav`, `chunk_001.wav`, ... and the returned
/// vector preserves chunk order so the caller can transcribe sequentially.
///
/// `output_dir` must already exist — typically a temp directory the caller
/// owns and cleans up after transcription completes.
pub fn split_wav(
    ffmpeg_path: &str,
    source_wav: &Path,
    chunks: &[ChunkSpec],
    output_dir: &Path,
) -> Result<Vec<PathBuf>, ChunkingError> {
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
    if !source_wav.exists() {
        return Err(ChunkingError::Io {
            message: format!("Source WAV not found: {}", source_wav.display()),
        });
    }
    if !output_dir.exists() {
        return Err(ChunkingError::Io {
            message: format!(
                "Chunk output directory does not exist: {}",
                output_dir.display()
            ),
        });
    }

    let mut written: Vec<PathBuf> = Vec::with_capacity(chunks.len());

    for (idx, chunk) in chunks.iter().enumerate() {
        let chunk_path = output_dir.join(format!("chunk_{:03}.wav", idx));
        let duration = chunk.end_sec - chunk.start_sec;
        if duration <= 0.0 {
            return Err(ChunkingError::Io {
                message: format!(
                    "Chunk {} has non-positive duration ({:.3}s)",
                    idx, duration
                ),
            });
        }

        let output = build_split_command(ffmpeg_path, source_wav, &chunk_path, chunk)
            .output()
            .map_err(|e| ChunkingError::FfmpegFailed {
                message: format!("Could not launch FFmpeg to split chunk {}: {}", idx, e),
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ChunkingError::FfmpegFailed {
                message: format!(
                    "FFmpeg exited with error splitting chunk {}: {}",
                    idx,
                    stderr.trim()
                ),
            });
        }

        if !chunk_path.exists() {
            return Err(ChunkingError::FfmpegFailed {
                message: format!(
                    "FFmpeg reported success but chunk file was not written: {}",
                    chunk_path.display()
                ),
            });
        }

        written.push(chunk_path);
    }

    Ok(written)
}

fn build_split_command(
    ffmpeg_path: &str,
    source_wav: &Path,
    chunk_path: &Path,
    chunk: &ChunkSpec,
) -> Command {
    let duration = chunk.end_sec - chunk.start_sec;
    let mut cmd = Command::new(ffmpeg_path);
    cmd.arg("-y") // overwrite (paths are scoped to a temp dir we own)
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        // `-ss` *before* `-i` does input-side seek — fast and frame-accurate
        // enough for our use (the underlying file is PCM, no keyframes).
        .arg("-ss")
        .arg(format!("{}", chunk.start_sec))
        .arg("-i")
        .arg(source_wav)
        .arg("-t")
        .arg(format!("{}", duration))
        .arg("-ar")
        .arg("16000")
        .arg("-ac")
        .arg("1")
        .arg("-c:a")
        .arg("pcm_s16le")
        .arg(chunk_path);

    apply_no_console_window(&mut cmd);
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_command_includes_ss_t_and_pcm_args() {
        let chunk = ChunkSpec {
            start_sec: 480.0,
            end_sec: 1080.0,
        };
        let cmd = build_split_command(
            "/usr/bin/ffmpeg",
            Path::new("/tmp/in.wav"),
            Path::new("/tmp/chunk_001.wav"),
            &chunk,
        );

        let args: Vec<String> = cmd
            .get_args()
            .map(|s| s.to_string_lossy().to_string())
            .collect();

        let ss_idx = args.iter().position(|a| a == "-ss").expect("missing -ss");
        assert_eq!(args[ss_idx + 1], "480");

        let t_idx = args.iter().position(|a| a == "-t").expect("missing -t");
        assert_eq!(args[t_idx + 1], "600");

        assert!(args.iter().any(|a| a == "pcm_s16le"));
        assert!(args.iter().any(|a| a == "16000"));
    }

    #[test]
    fn test_split_returns_error_for_empty_ffmpeg_path() {
        let dummy = ChunkSpec {
            start_sec: 0.0,
            end_sec: 1.0,
        };
        let err = split_wav(
            "",
            Path::new("/tmp/in.wav"),
            &[dummy],
            Path::new("/tmp"),
        )
        .unwrap_err();
        match err {
            ChunkingError::FfmpegMissing { .. } => {}
            other => panic!("expected FfmpegMissing, got {:?}", other),
        }
    }
}

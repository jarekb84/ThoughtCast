//! Drives the chunked transcription path: silence-detect + split → per-chunk
//! Whisper → stitch → write the final transcript. Emits per-chunk progress so
//! the UI can show "chunk 2 of 3" while the long-running Whisper passes run.

use crate::recording::chunking::{plan_and_split, ChunkingError};
use crate::recording::models::AppConfig;
use crate::recording::transcription::engine::transcribe_audio_file;
use crate::recording::transcription::text_processor::save_transcript;
use std::fs;
use std::path::{Path, PathBuf};

/// Telemetry collected during the chunking run. Persisted on the `Session`
/// so the Settings panel can report overhead averages.
#[derive(Debug, Clone)]
pub struct ChunkingTelemetry {
    pub analysis_seconds: f64,
    pub chunk_count: u32,
    pub used_fallback: bool,
}

/// Outcome of a chunked transcription: same shape as the single-shot path
/// plus telemetry the caller persists on the session.
#[derive(Debug)]
pub struct ChunkedTranscriptionOutcome {
    pub transcript_path: String,
    pub transcript_text: String,
    pub telemetry: ChunkingTelemetry,
}

/// Run the chunked transcription pipeline end-to-end.
///
/// `on_progress(current, total)` is invoked once per chunk *before* that
/// chunk's Whisper pass starts, so the UI updates as soon as the chunk is
/// in flight rather than after it lands.
pub fn transcribe_in_chunks(
    audio_path: &Path,
    session_id: &str,
    audio_duration_sec: f64,
    config: &AppConfig,
    on_progress: impl Fn(u32, u32),
) -> Result<ChunkedTranscriptionOutcome, String> {
    let chunk_dir = make_chunk_workspace(audio_path, session_id)
        .map_err(|e| format!("Failed to prepare chunking workspace: {}", e))?;

    let result = run_chunked_transcription(
        audio_path,
        session_id,
        audio_duration_sec,
        config,
        &chunk_dir,
        on_progress,
    );

    // Always attempt cleanup, even on failure. Best-effort: a stranded temp
    // directory is harmless; we don't want a cleanup error to mask the real
    // transcription error.
    let _ = fs::remove_dir_all(&chunk_dir);

    result
}

/// Create a temp directory adjacent to the source WAV. Co-locating with the
/// audio file keeps the per-chunk FFmpeg writes on the same volume so they
/// don't trigger cross-drive copies on Windows.
fn make_chunk_workspace(audio_path: &Path, session_id: &str) -> std::io::Result<PathBuf> {
    let parent = audio_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let chunk_dir = parent.join(format!(".chunks-{}", session_id));
    if chunk_dir.exists() {
        // Stale workspace from a crashed run — clear it.
        let _ = fs::remove_dir_all(&chunk_dir);
    }
    fs::create_dir_all(&chunk_dir)?;
    Ok(chunk_dir)
}

fn run_chunked_transcription(
    audio_path: &Path,
    session_id: &str,
    audio_duration_sec: f64,
    config: &AppConfig,
    chunk_dir: &Path,
    on_progress: impl Fn(u32, u32),
) -> Result<ChunkedTranscriptionOutcome, String> {
    let outcome = plan_and_split(
        &config.ffmpeg_path,
        audio_path,
        audio_duration_sec,
        &config.audio_chunking,
        chunk_dir,
    )
    .map_err(map_chunking_error)?;

    let chunk_count = outcome.chunk_files.len() as u32;
    if chunk_count == 0 {
        return Err("Chunking pipeline produced zero chunks for a non-empty recording".to_string());
    }

    let mut chunk_texts: Vec<String> = Vec::with_capacity(outcome.chunk_files.len());
    for (idx, chunk_path) in outcome.chunk_files.iter().enumerate() {
        on_progress((idx as u32) + 1, chunk_count);
        let text = transcribe_audio_file(chunk_path)?;
        chunk_texts.push(text);
    }

    let stitched = stitch_chunks(&chunk_texts);
    let transcript_path = save_transcript(session_id, &stitched)?;

    Ok(ChunkedTranscriptionOutcome {
        transcript_path,
        transcript_text: stitched,
        telemetry: ChunkingTelemetry {
            analysis_seconds: outcome.analysis_seconds,
            chunk_count,
            used_fallback: outcome.used_fallback,
        },
    })
}

/// Join per-chunk transcripts into a single document. A blank line between
/// chunks is intentional — it gives the reader a visual seam that maps to a
/// natural pause without breaking sentence flow.
fn stitch_chunks(chunk_texts: &[String]) -> String {
    chunk_texts
        .iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn map_chunking_error(err: ChunkingError) -> String {
    match err {
        ChunkingError::FfmpegMissing { message } => {
            format!("Chunking aborted: FFmpeg unavailable ({})", message)
        }
        ChunkingError::FfmpegFailed { message } => format!("Chunking aborted: {}", message),
        ChunkingError::Io { message } => format!("Chunking aborted: I/O error ({})", message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stitch_joins_chunks_with_blank_line() {
        let chunks = vec![
            "First chunk text.".to_string(),
            "Second chunk text.".to_string(),
            "Third chunk text.".to_string(),
        ];
        let stitched = stitch_chunks(&chunks);
        assert_eq!(
            stitched,
            "First chunk text.\n\nSecond chunk text.\n\nThird chunk text."
        );
    }

    #[test]
    fn test_stitch_trims_per_chunk_whitespace() {
        let chunks = vec![
            "  leading and trailing whitespace  \n".to_string(),
            "\n\nanother\n".to_string(),
        ];
        let stitched = stitch_chunks(&chunks);
        assert_eq!(stitched, "leading and trailing whitespace\n\nanother");
    }

    #[test]
    fn test_stitch_drops_empty_chunks() {
        let chunks = vec!["real text".to_string(), "".to_string(), "more text".to_string()];
        let stitched = stitch_chunks(&chunks);
        assert_eq!(stitched, "real text\n\nmore text");
    }

    #[test]
    fn test_stitch_single_chunk() {
        let chunks = vec!["just one".to_string()];
        assert_eq!(stitch_chunks(&chunks), "just one");
    }

    #[test]
    fn test_stitch_no_chunks_returns_empty() {
        let chunks: Vec<String> = vec![];
        assert_eq!(stitch_chunks(&chunks), "");
    }

    #[test]
    fn test_map_chunking_error_distinguishes_variants_in_message() {
        // The orchestrator collapses ChunkingError to String for the legacy
        // API — keep the variant tag in the message so logs are diagnosable.
        let missing = map_chunking_error(ChunkingError::FfmpegMissing {
            message: "no binary".to_string(),
        });
        assert!(missing.contains("FFmpeg unavailable"));
        assert!(missing.contains("no binary"));

        let failed = map_chunking_error(ChunkingError::FfmpegFailed {
            message: "exit 1".to_string(),
        });
        assert!(failed.starts_with("Chunking aborted:"));
        assert!(failed.contains("exit 1"));
        assert!(!failed.contains("FFmpeg unavailable"));

        let io = map_chunking_error(ChunkingError::Io {
            message: "disk full".to_string(),
        });
        assert!(io.contains("I/O error"));
        assert!(io.contains("disk full"));
    }
}

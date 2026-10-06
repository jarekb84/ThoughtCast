//! The transcription half of a recording's life: run the configured engine on
//! a saved WAV (chunked when the recording is long), copy the transcript to
//! the clipboard, and persist the result on the session row. Shared by the
//! stop-recording flow and the retranscribe flow.

use crate::recording::audio::{analyze_wav, RecordingQuality};
use crate::recording::compression::{run_post_transcription_compression, SessionAudioCompressedEvent};
use crate::recording::models::{AppConfig, Session};
use crate::recording::state::{RecordingStatus, SharedRecordingState};
use crate::recording::transcription::{
    save_transcript, transcribe_file, transcribe_in_chunks, ChunkingTelemetry,
};
use crate::recording::utils::copy_to_clipboard;
use std::path::Path;
use std::sync::Arc;
use std::thread;
use std::time::Instant;

/// Orchestrate async transcription in background thread
///
/// This function spawns a background thread that:
/// 1. Processes transcription
/// 2. Updates session with results
/// 3. Updates recording state to idle
/// 4. Emits Tauri event with results
///
/// This is domain orchestration logic extracted from the Tauri command layer.
///
/// # Arguments
/// * `state` - Shared recording state for status updates
/// * `session_id` - ID of session to transcribe
/// * `audio_path` - Path to audio file
/// * `event_emitter` - Callback to emit Tauri events (injected dependency)
pub fn orchestrate_async_transcription<F>(
    state: SharedRecordingState,
    session_id: String,
    audio_path: std::path::PathBuf,
    event_emitter: F,
) where
    F: Fn(TranscriptionResult) + Send + Sync + 'static,
{
    // Mark the session as in-flight for transcription before the worker thread
    // starts so the batch-compression worker won't race it.
    if let Ok(mut state_guard) = state.lock() {
        state_guard.transcribing_session_ids.insert(session_id.clone());
    }

    thread::spawn(move || {
        // Arc the emitter so the progress callback (which fires repeatedly
        // during chunked transcription) can share it with the success/error
        // call paths.
        let emitter = Arc::new(event_emitter);
        let progress_session_id = session_id.clone();
        let progress_emitter = Arc::clone(&emitter);
        let progress_fn = move |current: u32, total: u32| {
            progress_emitter(TranscriptionResult::Progress(ChunkProgressEvent {
                session_id: progress_session_id.clone(),
                current,
                total,
            }));
        };

        let result = process_transcription_async(audio_path, session_id.clone(), &progress_fn);

        // Update state to idle regardless of success/failure
        if let Ok(mut state_guard) = state.lock() {
            state_guard.status = RecordingStatus::Idle;
            state_guard.transcribing_session_ids.remove(&session_id);
        }

        // Emit event via injected callback
        match result {
            Ok(session) => {
                let audio_path_for_compression = session.audio_path.clone();
                let session_id_for_compression = session.id.clone();
                emitter(TranscriptionResult::Success(session));

                // Best-effort post-transcription compression. Runs on this same
                // background thread after the success event has already fired
                // so the UI gets a transcript first and then a follow-up
                // compression event if compression was enabled.
                match run_post_transcription_compression(
                    &session_id_for_compression,
                    &audio_path_for_compression,
                ) {
                    Ok(Some(compression_event)) => {
                        emitter(TranscriptionResult::Compressed(compression_event));
                    }
                    Ok(None) => {
                        // Compression disabled — nothing to do.
                    }
                    Err(e) => {
                        // Non-fatal: WAV stays put, session row remains valid.
                        log::warn!(
                            "Post-transcription compression failed for {}: {}",
                            session_id_for_compression,
                            e
                        );
                    }
                }
            }
            Err(error) => emitter(TranscriptionResult::Error {
                session_id,
                error,
            }),
        }
    });
}

/// Per-chunk progress for a chunked transcription. `current` is 1-indexed.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChunkProgressEvent {
    pub session_id: String,
    pub current: u32,
    pub total: u32,
}

/// Result of async transcription for event emission. Shared between the
/// initial-recording (`orchestrate_async_transcription`) and retranscription
/// (`retranscription::orchestrate_async_retranscription`) pipelines so both
/// emit the same Tauri events.
pub enum TranscriptionResult {
    Success(Session),
    Progress(ChunkProgressEvent),
    Compressed(SessionAudioCompressedEvent),
    Error { session_id: String, error: String },
}

/// Process transcription asynchronously and update session
///
/// This is the second phase of the stop workflow:
/// 1. Transcribes audio (if configured) — routes through the chunked path
///    when the recording is long enough and chunking is enabled
/// 2. Copies transcript to clipboard (if successful)
/// 3. Updates session record with transcription + chunking telemetry
///
/// `on_progress(current, total)` fires per chunk on the chunked path. The
/// single-shot path does not emit progress (the UI falls back to its
/// time-based estimate).
///
/// Returns updated session on success, or error message on failure
pub fn process_transcription_async(
    audio_path: std::path::PathBuf,
    session_id: String,
    on_progress: &(dyn Fn(u32, u32) + Sync),
) -> Result<Session, String> {
    use crate::recording::session::storage::{load_sessions, save_sessions};

    let mut index = load_sessions()?;
    let audio_duration = index
        .sessions
        .iter()
        .find(|s| s.id == session_id)
        .map(|s| s.duration)
        .unwrap_or(0.0);

    // Single config load: drives both the route decision (chunking vs
    // single-shot) and the model-path telemetry the estimator needs.
    let config = crate::recording::load_config().ok();

    let recording_quality = measure_recording_quality(&audio_path);

    let transcription_start = Instant::now();
    let (transcript_path, preview, clipboard_copied, chunking_telemetry) =
        run_transcription_route(
            &audio_path,
            &session_id,
            audio_duration,
            config.as_ref(),
            on_progress,
        );
    let transcription_elapsed = transcription_start.elapsed().as_secs_f64();

    let model_path = config.as_ref().map(|c| c.active_model_path().to_string());

    let updated_session = {
        let session = index
            .sessions
            .iter_mut()
            .find(|s| s.id == session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        session.transcript_path = transcript_path.clone();
        session.preview = preview;
        session.clipboard_copied = clipboard_copied;

        if !transcript_path.is_empty() && audio_duration > 0.0 {
            session.transcription_time_seconds = Some(transcription_elapsed);
            session.model_path = model_path;
        }
        if let Some(telemetry) = chunking_telemetry {
            session.chunking_analysis_seconds = Some(telemetry.analysis_seconds);
            session.chunk_count = Some(telemetry.chunk_count);
            session.chunking_used_fallback = Some(telemetry.used_fallback);
        }
        if recording_quality.is_some() {
            session.recording_quality = recording_quality;
        }

        session.clone()
    };

    save_sessions(&index)?;

    Ok(updated_session)
}

/// Decide between the chunked and single-shot transcription paths and run
/// the chosen one. Returns the same shape the legacy single-shot path
/// produced, plus optional chunking telemetry to persist on the session.
///
/// Chunking is silently disabled when FFmpeg is missing or unconfigured —
/// the user shouldn't get a transcription failure just because chunking
/// can't run. The path falls back to a normal single-shot transcription
/// in that case (PRD edge case 7).
pub(crate) fn run_transcription_route(
    audio_path: &Path,
    session_id: &str,
    audio_duration_sec: f64,
    config: Option<&AppConfig>,
    on_progress: &(dyn Fn(u32, u32) + Sync),
) -> (String, String, bool, Option<ChunkingTelemetry>) {
    let result = match config {
        None => Err("app config could not be loaded".to_string()),
        Some(cfg) if should_use_chunking(cfg, audio_duration_sec) => {
            transcribe_in_chunks(audio_path, session_id, audio_duration_sec, cfg, on_progress)
                .map(|o| (o.transcript_path, o.transcript_text, Some(o.telemetry)))
        }
        Some(cfg) => transcribe_single(audio_path, session_id, cfg).map(|(p, t)| (p, t, None)),
    };

    match result {
        Ok((transcript_path, text, telemetry)) => {
            let preview = generate_preview(&text);
            // Clipboard failures never fail the transcription.
            let clipboard_copied = !text.is_empty() && copy_to_clipboard(&text).is_ok();
            (transcript_path, preview, clipboard_copied, telemetry)
        }
        Err(e) => {
            log::error!("Transcription failed: {}", e);
            (String::new(), format!("Transcription failed: {}", e), false, None)
        }
    }
}

/// Measure the recording's signal health from the WAV about to be
/// transcribed. Advisory only: a failure is logged and leaves the field empty.
pub(crate) fn measure_recording_quality(wav_path: &Path) -> Option<RecordingQuality> {
    match analyze_wav(wav_path) {
        Ok(quality) => quality,
        Err(e) => {
            log::warn!("Recording quality analysis skipped: {}", e);
            None
        }
    }
}

fn should_use_chunking(config: &AppConfig, audio_duration_sec: f64) -> bool {
    if !config.audio_chunking.enabled {
        return false;
    }
    let ffmpeg = config.ffmpeg_path.trim();
    if ffmpeg.is_empty() {
        return false;
    }
    if !Path::new(ffmpeg).exists() {
        log::warn!("Chunking enabled but FFmpeg not found at '{}' — running single-shot transcription instead", ffmpeg);
        return false;
    }
    audio_duration_sec > config.audio_chunking.min_chunk_duration_sec
}

/// Transcribe the whole file in one engine pass and save the transcript.
/// Returns (transcript_path, transcript_text).
fn transcribe_single(
    audio_path: &Path,
    session_id: &str,
    config: &AppConfig,
) -> Result<(String, String), String> {
    let text = transcribe_file(audio_path, config)?;
    let transcript_path = save_transcript(session_id, &text)?;
    Ok((transcript_path, text))
}

const PREVIEW_CHARS: usize = 100;

/// Generate a preview string from transcript text. Truncates by characters,
/// not bytes, so a multi-byte character (an em dash, an accented letter) at
/// the cut can't panic.
fn generate_preview(text: &str) -> String {
    if text.is_empty() {
        return "No transcript".to_string();
    }
    match text.char_indices().nth(PREVIEW_CHARS) {
        Some((cut, _)) => format!("{}...", &text[..cut]),
        None => text.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preview_keeps_short_text() {
        assert_eq!(generate_preview("short note"), "short note");
    }

    #[test]
    fn test_preview_marks_empty_transcript() {
        assert_eq!(generate_preview(""), "No transcript");
    }

    #[test]
    fn test_preview_truncates_long_text_to_100_chars() {
        let text = "a".repeat(150);
        assert_eq!(generate_preview(&text), format!("{}...", "a".repeat(100)));
    }

    #[test]
    fn test_preview_does_not_split_multibyte_characters() {
        // 99 ASCII bytes then an em dash (3 bytes) straddling byte 100.
        let text = format!("{}\u{2014}{}", "a".repeat(99), "b".repeat(50));
        let preview = generate_preview(&text);
        assert_eq!(preview, format!("{}\u{2014}...", "a".repeat(99)));
    }
}

use crate::recording::audio::{start_capture, write_wav_file};
use crate::recording::compression::{run_post_transcription_compression, SessionAudioCompressedEvent};
use crate::recording::models::{AppConfig, Session};
use crate::recording::session::storage::add_session;
use crate::recording::state::{RecordingStatus, SharedRecordingState};
use crate::recording::transcription::{
    transcribe_in_chunks, transcribe_with_whisper, ChunkingTelemetry,
};
use crate::recording::utils::{copy_to_clipboard, get_storage_dir};
use chrono::Utc;
use std::path::Path;
use std::sync::Arc;
use std::thread;
use std::time::Instant;

/// Start a new recording session
///
/// Initializes audio capture and manages recording state
pub fn start_recording(state: SharedRecordingState) -> Result<(), String> {
    start_capture(state)
}

/// Pause the current recording session
///
/// Stops audio capture while preserving existing recording.
/// Recording can be resumed to continue from this point.
pub fn pause_recording(state: SharedRecordingState) -> Result<(), String> {
    let mut state_guard = state.lock().unwrap();

    if state_guard.status != RecordingStatus::Recording {
        return Err("No active recording to pause.".to_string());
    }

    state_guard.status = RecordingStatus::Paused;
    state_guard.pause_start_time = Some(Utc::now());

    Ok(())
}

/// Resume a paused recording session
///
/// Continues audio capture from where it was paused.
pub fn resume_recording(state: SharedRecordingState) -> Result<(), String> {
    let mut state_guard = state.lock().unwrap();

    if state_guard.status != RecordingStatus::Paused {
        return Err("No paused recording to resume.".to_string());
    }

    // Calculate duration of this pause and add to total
    if let Some(pause_start) = state_guard.pause_start_time {
        let pause_end = Utc::now();
        let pause_duration = (pause_end - pause_start).num_milliseconds();
        state_guard.total_paused_duration_ms += pause_duration;
    }

    state_guard.status = RecordingStatus::Recording;
    state_guard.pause_start_time = None;

    Ok(())
}

/// Cancel the current recording session
///
/// Discards the recording without saving. No audio file or session entry is created.
pub fn cancel_recording(state: SharedRecordingState) -> Result<(), String> {
    let mut state_guard = state.lock().unwrap();

    if !state_guard.is_active() {
        return Err("No active recording to cancel.".to_string());
    }

    // Reset to idle state
    state_guard.status = RecordingStatus::Idle;
    state_guard.start_time = None;
    state_guard.pause_start_time = None;
    state_guard.total_paused_duration_ms = 0;

    // Clear samples
    {
        let mut samples = state_guard.samples.lock().unwrap();
        samples.clear();
    }

    Ok(())
}

/// Stop the current recording session and save the audio
///
/// This is the first phase of the stop workflow:
/// 1. Stops audio capture
/// 2. Saves audio to WAV file
/// 3. Creates initial session record (without transcription)
/// 4. Returns session info for async transcription
///
/// Transcription happens asynchronously via process_transcription_async
///
/// Can be called from Recording or Paused state.
pub fn stop_recording(state: SharedRecordingState) -> Result<Session, String> {
    let mut state_guard = state.lock().unwrap();

    if !state_guard.is_active() {
        return Err("No active recording to stop.".to_string());
    }

    // If currently paused, finalize the pause duration
    if state_guard.status == RecordingStatus::Paused {
        if let Some(pause_start) = state_guard.pause_start_time {
            let pause_end = Utc::now();
            let pause_duration = (pause_end - pause_start).num_milliseconds();
            state_guard.total_paused_duration_ms += pause_duration;
        }
    }

    // Calculate duration (excluding paused time)
    let duration = calculate_duration(&state_guard);

    // Mark as processing (this will stop the recording thread)
    state_guard.status = RecordingStatus::Processing;

    // Wait a bit for the recording thread to finish collecting samples
    drop(state_guard);
    thread::sleep(std::time::Duration::from_millis(200));
    let state_guard = state.lock().unwrap();

    // Generate timestamp-based ID
    let timestamp = Utc::now();
    let id = timestamp.format("%Y-%m-%d_%H-%M-%S").to_string();

    // Save audio file (returned for Tauri command to use for async transcription)
    let _audio_path = save_audio_file(&id, &state_guard)?;

    // Create initial session record (transcription will be added later)
    let session = Session {
        id: id.clone(),
        timestamp: timestamp.to_rfc3339(),
        audio_path: format!("audio/{}.wav", id),
        duration,
        preview: "Processing...".to_string(),
        transcript_path: String::new(),
        clipboard_copied: false,
        transcription_time_seconds: None,
        model_path: None,
        chunking_analysis_seconds: None,
        chunk_count: None,
        chunking_used_fallback: None,
    };

    // Persist initial session to index
    add_session(session.clone())?;

    Ok(session)
}

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

/// Result of async transcription for event emission
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

    let model_path = config.as_ref().map(|c| c.model_path.clone());

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
fn run_transcription_route(
    audio_path: &Path,
    session_id: &str,
    audio_duration_sec: f64,
    config: Option<&AppConfig>,
    on_progress: &(dyn Fn(u32, u32) + Sync),
) -> (String, String, bool, Option<ChunkingTelemetry>) {
    if let Some(cfg) = config {
        if should_use_chunking(cfg, audio_duration_sec) {
            return run_chunked_path(audio_path, session_id, audio_duration_sec, cfg, on_progress);
        }
    }

    let (path, preview, copied) = process_transcription(audio_path, session_id);
    (path, preview, copied, None)
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

fn run_chunked_path(
    audio_path: &Path,
    session_id: &str,
    audio_duration_sec: f64,
    config: &AppConfig,
    on_progress: &(dyn Fn(u32, u32) + Sync),
) -> (String, String, bool, Option<ChunkingTelemetry>) {
    match transcribe_in_chunks(audio_path, session_id, audio_duration_sec, config, on_progress) {
        Ok(outcome) => {
            let preview = generate_preview(&outcome.transcript_text);
            let clipboard_copied = if !outcome.transcript_text.is_empty() {
                copy_to_clipboard(&outcome.transcript_text).is_ok()
            } else {
                false
            };
            (
                outcome.transcript_path,
                preview,
                clipboard_copied,
                Some(outcome.telemetry),
            )
        }
        Err(e) => {
            log::error!("Chunked transcription failed: {}", e);
            (
                String::new(),
                format!("Transcription failed: {}", e),
                false,
                None,
            )
        }
    }
}

/// Calculate recording duration from start time, excluding paused time
fn calculate_duration(state: &crate::recording::state::RecordingState) -> f64 {
    if let Some(start_time) = state.start_time {
        let end_time = Utc::now();
        let total_elapsed_ms = (end_time - start_time).num_milliseconds();
        let active_recording_ms = total_elapsed_ms - state.total_paused_duration_ms;
        active_recording_ms as f64 / 1000.0
    } else {
        0.0
    }
}

/// Save recorded audio samples to a WAV file
fn save_audio_file(
    id: &str,
    state: &crate::recording::state::RecordingState,
) -> Result<std::path::PathBuf, String> {
    let storage_dir = get_storage_dir()?;
    let audio_filename = format!("{}.wav", id);
    let audio_path = storage_dir.join("audio").join(&audio_filename);

    // Copy samples from state
    let samples = state.samples.lock().unwrap();
    write_wav_file(&samples, &audio_path)?;

    Ok(audio_path)
}

/// Process transcription and handle result
///
/// Returns (transcript_path, preview, clipboard_copied)
fn process_transcription(
    audio_path: &std::path::Path,
    id: &str,
) -> (String, String, bool) {
    match transcribe_with_whisper(audio_path, id) {
        Ok((path, text)) => {
            // Generate preview from transcript
            let preview = generate_preview(&text);

            // Attempt automatic clipboard copy
            let clipboard_copied = if !text.is_empty() {
                match copy_to_clipboard(&text) {
                    Ok(_) => {
                        println!("Transcript copied to clipboard");
                        true
                    }
                    Err(e) => {
                        eprintln!("Failed to copy to clipboard: {}", e);
                        false
                    }
                }
            } else {
                false
            };

            (path, preview, clipboard_copied)
        }
        Err(e) => {
            // Log error but don't fail the recording
            eprintln!("Transcription failed: {}", e);
            (String::new(), format!("Transcription failed: {}", e), false)
        }
    }
}

/// Generate a preview string from transcript text
fn generate_preview(text: &str) -> String {
    if text.len() > 100 {
        format!("{}...", &text[..100])
    } else if text.is_empty() {
        "No transcript".to_string()
    } else {
        text.to_string()
    }
}

/// Re-transcribe an existing audio session
///
/// This will overwrite any existing transcript for this session
pub fn retranscribe_session(session_id: &str) -> Result<String, String> {
    use crate::recording::session::storage::{load_sessions, save_sessions};

    let storage_dir = get_storage_dir()?;

    // Load sessions to find the audio file
    let mut index = load_sessions()?;

    // Find the session
    let session = index
        .sessions
        .iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    // Get the full path to the audio file
    let audio_path = storage_dir.join(&session.audio_path);

    if !audio_path.exists() {
        return Err(format!("Audio file not found: {}", audio_path.display()));
    }

    // Get audio duration for metadata
    let audio_duration = session.duration;

    let config = crate::recording::load_config().ok();
    let no_op_progress: &(dyn Fn(u32, u32) + Sync) = &|_, _| {};

    let transcription_start = Instant::now();
    let (transcript_path, preview, _clipboard_copied, chunking_telemetry) =
        run_transcription_route(
            &audio_path,
            session_id,
            audio_duration,
            config.as_ref(),
            no_op_progress,
        );
    let transcription_elapsed = transcription_start.elapsed().as_secs_f64();

    // Reload transcript text from disk so the return matches the saved file
    // exactly (whether single-shot or stitched-chunk output).
    let transcript_text = if transcript_path.is_empty() {
        return Err(preview);
    } else {
        let abs_transcript = storage_dir.join(&transcript_path);
        std::fs::read_to_string(&abs_transcript)
            .map_err(|e| format!("Failed to read regenerated transcript: {}", e))?
    };

    let model_path = config.as_ref().map(|c| c.model_path.clone());

    session.transcript_path = transcript_path.clone();
    session.preview = preview;

    if !transcript_path.is_empty() && audio_duration > 0.0 {
        session.transcription_time_seconds = Some(transcription_elapsed);
        session.model_path = model_path;
    }
    if let Some(telemetry) = chunking_telemetry {
        session.chunking_analysis_seconds = Some(telemetry.analysis_seconds);
        session.chunk_count = Some(telemetry.chunk_count);
        session.chunking_used_fallback = Some(telemetry.used_fallback);
    }

    save_sessions(&index)?;

    Ok(transcript_text)
}

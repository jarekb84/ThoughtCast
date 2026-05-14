use crate::recording::audio::{read_wav_duration_seconds, start_capture, write_wav_file};
use crate::recording::compression::{run_post_transcription_compression, SessionAudioCompressedEvent};
use crate::recording::models::{AppConfig, Session};
use crate::recording::session::storage::add_session;
use crate::recording::state::{RecordingStatus, SharedRecordingState};
use crate::recording::transcription::{
    decode_to_wav, transcribe_in_chunks, transcribe_with_whisper, ChunkingTelemetry,
};
use crate::recording::utils::{copy_to_clipboard, get_storage_dir};
use chrono::Utc;
use std::path::{Path, PathBuf};
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
///
/// Uses the device-reported sample rate the audio thread published on the
/// state. Falls back to 44.1 kHz only if the audio thread hasn't populated it
/// — which would mean capture initialization failed, in which case the
/// samples buffer is empty and the rate is irrelevant.
fn save_audio_file(
    id: &str,
    state: &crate::recording::state::RecordingState,
) -> Result<std::path::PathBuf, String> {
    let storage_dir = get_storage_dir()?;
    let audio_filename = format!("{}.wav", id);
    let audio_path = storage_dir.join("audio").join(&audio_filename);

    let sample_rate = state.sample_rate.unwrap_or(44_100);
    let samples = state.samples.lock().unwrap();
    write_wav_file(&samples, &audio_path, sample_rate)?;

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

/// Mark a session as "in-flight" for re-transcription and return the updated
/// session row.
///
/// This is the synchronous half of the retranscribe workflow — the caller is
/// expected to hand the returned session to the frontend immediately and then
/// kick off `orchestrate_async_retranscription` to actually run Whisper on a
/// background thread. Mirrors the `stop_recording` → `orchestrate_async_transcription`
/// pattern so the UI's existing "Processing..." view can light up without any
/// new frontend plumbing.
pub fn start_retranscription(session_id: &str) -> Result<Session, String> {
    use crate::recording::session::storage::{load_sessions, save_sessions};

    let storage_dir = get_storage_dir()?;
    let mut index = load_sessions()?;

    let session = index
        .sessions
        .iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let audio_path = storage_dir.join(&session.audio_path);
    if !audio_path.exists() {
        return Err(format!("Audio file not found: {}", audio_path.display()));
    }

    // The literal "Processing..." preview is what the SessionViewer keys off
    // to render the spinner + estimated-time UI (see
    // `determineTranscriptionState` on the frontend). Reusing the same marker
    // means retranscribe gets the existing transcribing view for free.
    session.preview = "Processing...".to_string();
    let updated = session.clone();

    save_sessions(&index)?;
    Ok(updated)
}

/// Orchestrate async re-transcription in a background thread.
///
/// Mirrors `orchestrate_async_transcription`: spawns a worker, runs the
/// retranscription pipeline, and emits the same `TranscriptionResult` events
/// the initial-recording flow uses so the UI listeners already wired up in
/// `useRecordingWorkflow` light up without any frontend-side changes.
///
/// Skips post-transcription compression — the session's source audio was
/// already compressed (or never qualified), and re-compressing on every
/// retranscribe would waste CPU and re-encode m4a → m4a.
pub fn orchestrate_async_retranscription<F>(
    state: SharedRecordingState,
    session_id: String,
    event_emitter: F,
) where
    F: Fn(TranscriptionResult) + Send + Sync + 'static,
{
    if let Ok(mut state_guard) = state.lock() {
        state_guard.transcribing_session_ids.insert(session_id.clone());
    }

    thread::spawn(move || {
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

        let result = process_retranscription_async(session_id.clone(), &progress_fn);

        if let Ok(mut state_guard) = state.lock() {
            state_guard.transcribing_session_ids.remove(&session_id);
        }

        match result {
            Ok(session) => emitter(TranscriptionResult::Success(session)),
            Err(error) => emitter(TranscriptionResult::Error { session_id, error }),
        }
    });
}

/// Run the actual retranscription work: decode source audio if needed,
/// transcribe, sync the session row's duration to the audio file's true
/// playback duration, and persist the updated session.
fn process_retranscription_async(
    session_id: String,
    on_progress: &(dyn Fn(u32, u32) + Sync),
) -> Result<Session, String> {
    use crate::recording::session::storage::{load_sessions, save_sessions};

    let storage_dir = get_storage_dir()?;
    let mut index = load_sessions()?;
    let session = index
        .sessions
        .iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let audio_path = storage_dir.join(&session.audio_path);
    if !audio_path.exists() {
        return Err(format!("Audio file not found: {}", audio_path.display()));
    }

    let session_wall_clock_duration = session.duration;
    let config = crate::recording::load_config().ok();

    let (transcription_input, temp_wav_to_cleanup) =
        prepare_retranscribe_input(&audio_path, &session_id, config.as_ref())?;

    // Drive chunking off the audio file's actual apparent duration. For
    // pre-fix recordings the WAV/M4A header was labelled 44.1 kHz while
    // CPAL captured at 48 kHz — making playback ~8.8% longer than
    // `session.duration`. Using the file's own timeline ensures the planner
    // covers every second of audio that ffmpeg will actually slice.
    let chunking_duration =
        chunking_duration_for(&transcription_input, session_wall_clock_duration);

    let transcription_start = Instant::now();
    let (transcript_path, preview, clipboard_copied, chunking_telemetry) =
        run_transcription_route(
            &transcription_input,
            &session_id,
            chunking_duration,
            config.as_ref(),
            on_progress,
        );
    let transcription_elapsed = transcription_start.elapsed().as_secs_f64();

    if let Some(temp) = temp_wav_to_cleanup {
        let _ = std::fs::remove_file(&temp);
    }

    if transcript_path.is_empty() {
        return Err(preview);
    }

    let model_path = config.as_ref().map(|c| c.model_path.clone());

    session.transcript_path = transcript_path.clone();
    session.preview = preview;
    session.clipboard_copied = clipboard_copied;

    // Reconcile session.duration with the audio's actual playback length.
    // Pre-fix recordings were stored with the wall-clock duration even though
    // their WAV/M4A headers report a stretched timeline; without this update
    // the UI keeps showing "17:21" for an 18:53 file forever.
    if (chunking_duration - session_wall_clock_duration).abs() > 0.5 {
        session.duration = chunking_duration;
    }

    if session_wall_clock_duration > 0.0 {
        session.transcription_time_seconds = Some(transcription_elapsed);
        session.model_path = model_path;
    }
    if let Some(telemetry) = chunking_telemetry {
        session.chunking_analysis_seconds = Some(telemetry.analysis_seconds);
        session.chunk_count = Some(telemetry.chunk_count);
        session.chunking_used_fallback = Some(telemetry.used_fallback);
    }

    let updated = session.clone();
    save_sessions(&index)?;
    Ok(updated)
}

/// Resolve the WAV path to feed into the transcription route.
///
/// Returns `(input_for_whisper, optional_temp_to_clean_up)`. The second slot
/// is `Some(path)` only when we created a temp WAV by decoding a compressed
/// source, so the caller can remove it after transcription completes.
///
/// Failure here is fatal for the retranscribe — without WAV input the
/// whisper.cpp call would fail anyway, and a meaningful FFmpeg error is far
/// more diagnosable than the generic whisper failure that would follow.
fn prepare_retranscribe_input(
    audio_path: &Path,
    session_id: &str,
    config: Option<&AppConfig>,
) -> Result<(PathBuf, Option<PathBuf>), String> {
    if is_wav_path(audio_path) {
        return Ok((audio_path.to_path_buf(), None));
    }

    let cfg = config.ok_or_else(|| {
        "Cannot retranscribe compressed audio: app config could not be loaded \
         (FFmpeg path is required to decode .m4a back to .wav)"
            .to_string()
    })?;

    let temp_wav = derive_retranscribe_temp_path(audio_path, session_id);
    decode_to_wav(&cfg.ffmpeg_path, audio_path, &temp_wav)?;
    Ok((temp_wav.clone(), Some(temp_wav)))
}

/// True if `p` looks like a WAV file by extension. Whisper.cpp only accepts
/// WAV, so anything else needs a decode step.
fn is_wav_path(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("wav"))
        .unwrap_or(false)
}

/// Co-locate the decoded WAV next to the compressed source so the chunk
/// pipeline's per-chunk writes stay on the same volume (the chunked
/// orchestrator does the same trick for its own workspace). The leading dot
/// hides it from casual `ls`; the session id keeps concurrent retranscribes
/// from colliding on the same path.
fn derive_retranscribe_temp_path(audio_path: &Path, session_id: &str) -> PathBuf {
    let parent = audio_path.parent().unwrap_or_else(|| Path::new("."));
    parent.join(format!(".retranscribe-{}.wav", session_id))
}

/// Pick the duration to feed into the chunking planner: the WAV's own
/// apparent duration if we can read it, otherwise the session's wall-clock
/// duration. Reading the header should never fail for a file we just
/// produced (passthrough WAV or freshly-decoded temp), but the fallback
/// keeps retranscribe from breaking if it does.
fn chunking_duration_for(wav_path: &Path, session_duration: f64) -> f64 {
    match read_wav_duration_seconds(wav_path) {
        Ok(d) if d > 0.0 => d,
        Ok(_) => session_duration,
        Err(e) => {
            log::warn!(
                "Could not read WAV duration for {} ({}); falling back to session.duration={}",
                wav_path.display(),
                e,
                session_duration
            );
            session_duration
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_wav_path_accepts_lowercase_wav() {
        assert!(is_wav_path(Path::new("/x/y/recording.wav")));
    }

    #[test]
    fn test_is_wav_path_accepts_mixed_case_wav() {
        assert!(is_wav_path(Path::new("/x/y/recording.WAV")));
        assert!(is_wav_path(Path::new("/x/y/recording.Wav")));
    }

    #[test]
    fn test_is_wav_path_rejects_m4a() {
        assert!(!is_wav_path(Path::new("/x/y/recording.m4a")));
    }

    #[test]
    fn test_is_wav_path_rejects_mp3_and_extensionless() {
        assert!(!is_wav_path(Path::new("/x/y/recording.mp3")));
        assert!(!is_wav_path(Path::new("/x/y/recording")));
    }

    #[test]
    fn test_derive_retranscribe_temp_path_uses_session_id_and_sibling_dir() {
        let audio = Path::new("/data/audio/2026-05-14_20-06-16.m4a");
        let temp = derive_retranscribe_temp_path(audio, "2026-05-14_20-06-16");
        // Compare path components rather than full string so the test is
        // platform-agnostic (Windows uses `\` separators).
        assert_eq!(temp.parent(), audio.parent());
        assert_eq!(
            temp.file_name().and_then(|s| s.to_str()),
            Some(".retranscribe-2026-05-14_20-06-16.wav")
        );
    }

    #[test]
    fn test_derive_retranscribe_temp_path_falls_back_to_cwd_when_no_parent() {
        let audio = Path::new("recording.m4a");
        let temp = derive_retranscribe_temp_path(audio, "abc");
        // Either ".retranscribe-abc.wav" (no parent) or "./.retranscribe-abc.wav"
        // — both are valid. We just want to confirm we didn't panic and the
        // session id ended up in the filename.
        let s = temp.to_string_lossy();
        assert!(s.contains(".retranscribe-abc.wav"), "got: {}", s);
    }

    #[test]
    fn test_prepare_retranscribe_input_passes_wav_through_without_temp() {
        let audio = Path::new("/data/audio/2026-05-14_20-06-16.wav");
        let (input, temp) = prepare_retranscribe_input(audio, "2026-05-14_20-06-16", None)
            .expect("WAV passthrough should not require config");
        assert_eq!(input, audio);
        assert!(temp.is_none(), "no temp file should be created for WAV input");
    }

    #[test]
    fn test_chunking_duration_for_falls_back_to_session_when_wav_missing() {
        let missing = Path::new("/nope/does/not/exist.wav");
        let duration = chunking_duration_for(missing, 123.4);
        assert_eq!(duration, 123.4);
    }

    #[test]
    fn test_chunking_duration_for_uses_wav_duration_when_readable() {
        use crate::recording::audio::write_wav_file;

        let mut path = std::env::temp_dir();
        path.push(format!(
            "thoughtcast_lifecycle_test_{}.wav",
            std::process::id()
        ));

        // 1 second of silence at 48 kHz — apparent duration should be 1.0s.
        let samples = vec![0.0f32; 48_000];
        write_wav_file(&samples, &path, 48_000).expect("write should succeed");

        // session.duration intentionally wrong (mimics pre-fix mislabelling).
        let duration = chunking_duration_for(&path, 0.918);
        assert!(
            (duration - 1.0).abs() < 0.001,
            "expected ~1.0s from WAV header, got {}",
            duration
        );

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_prepare_retranscribe_input_requires_config_for_non_wav() {
        let audio = Path::new("/data/audio/2026-05-14_20-06-16.m4a");
        let err = prepare_retranscribe_input(audio, "2026-05-14_20-06-16", None)
            .expect_err("non-WAV without config should fail");
        assert!(
            err.contains("FFmpeg path is required"),
            "error should explain ffmpeg requirement, got: {}",
            err
        );
    }
}

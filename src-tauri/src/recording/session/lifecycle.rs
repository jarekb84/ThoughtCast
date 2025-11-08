use crate::recording::audio::{start_capture, write_wav_file};
use crate::recording::models::Session;
use crate::recording::session::storage::add_session;
use crate::recording::state::{RecordingStatus, SharedRecordingState};
use crate::recording::transcription::transcribe_with_whisper;
use crate::recording::utils::{copy_to_clipboard, get_storage_dir};
use chrono::Utc;
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
    F: Fn(TranscriptionResult) + Send + 'static,
{
    thread::spawn(move || {
        let result = process_transcription_async(audio_path, session_id.clone());

        // Update state to idle regardless of success/failure
        if let Ok(mut state_guard) = state.lock() {
            state_guard.status = RecordingStatus::Idle;
        }

        // Emit event via injected callback
        match result {
            Ok(session) => event_emitter(TranscriptionResult::Success(session)),
            Err(error) => event_emitter(TranscriptionResult::Error {
                session_id,
                error,
            }),
        }
    });
}

/// Result of async transcription for event emission
pub enum TranscriptionResult {
    Success(Session),
    Error { session_id: String, error: String },
}

/// Process transcription asynchronously and update session
///
/// This is the second phase of the stop workflow:
/// 1. Transcribes audio (if configured)
/// 2. Copies transcript to clipboard (if successful)
/// 3. Updates session record with transcription results
/// 4. Records transcription timing statistics for future estimates
///
/// Returns updated session on success, or error message on failure
pub fn process_transcription_async(
    audio_path: std::path::PathBuf,
    session_id: String,
) -> Result<Session, String> {
    use crate::recording::session::storage::{load_sessions, save_sessions};

    // Load sessions to get audio duration before transcription
    let mut index = load_sessions()?;
    let audio_duration = index
        .sessions
        .iter()
        .find(|s| s.id == session_id)
        .map(|s| s.duration)
        .unwrap_or(0.0);

    // Time the transcription process
    let transcription_start = Instant::now();

    // Attempt transcription
    let (transcript_path, preview, clipboard_copied) =
        process_transcription(&audio_path, &session_id);

    let transcription_elapsed = transcription_start.elapsed().as_secs_f64();

    // Get model path for tracking
    let model_path = crate::recording::load_config()
        .ok()
        .map(|config| config.model_path);

    // Find and update the session
    let updated_session = {
        let session = index
            .sessions
            .iter_mut()
            .find(|s| s.id == session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        session.transcript_path = transcript_path.clone();
        session.preview = preview;
        session.clipboard_copied = clipboard_copied;

        // Store transcription metadata for progress estimation
        if !transcript_path.is_empty() && audio_duration > 0.0 {
            session.transcription_time_seconds = Some(transcription_elapsed);
            session.model_path = model_path;
        }

        session.clone()
    };

    // Save updated sessions
    save_sessions(&index)?;

    Ok(updated_session)
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

    // Time the transcription process
    let transcription_start = Instant::now();

    // Run transcription
    let (transcript_path, transcript_text) = transcribe_with_whisper(&audio_path, session_id)?;

    let transcription_elapsed = transcription_start.elapsed().as_secs_f64();

    // Get model path for tracking
    let model_path = crate::recording::load_config()
        .ok()
        .map(|config| config.model_path);

    // Update session with new transcript info
    session.transcript_path = transcript_path.clone();
    session.preview = generate_preview(&transcript_text);

    // Store transcription metadata for progress estimation
    if !transcript_path.is_empty() && audio_duration > 0.0 {
        session.transcription_time_seconds = Some(transcription_elapsed);
        session.model_path = model_path;
    }

    // Save updated sessions
    save_sessions(&index)?;

    Ok(transcript_text)
}

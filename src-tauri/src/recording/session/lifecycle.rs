use crate::recording::audio::{start_capture, write_wav_file};
use crate::recording::models::Session;
use crate::recording::session::storage::add_session;
use crate::recording::state::SharedRecordingState;
use crate::recording::transcription::transcribe_with_whisper;
use crate::recording::utils::{copy_to_clipboard, get_storage_dir};
use chrono::Utc;
use std::thread;

/// Start a new recording session
///
/// Initializes audio capture and manages recording state
pub fn start_recording(state: SharedRecordingState) -> Result<(), String> {
    start_capture(state)
}

/// Stop the current recording session and save the result
///
/// Coordinates the full workflow:
/// 1. Stops audio capture
/// 2. Saves audio to WAV file
/// 3. Transcribes audio (if configured)
/// 4. Copies transcript to clipboard (if successful)
/// 5. Creates and persists session record
pub fn stop_recording(state: SharedRecordingState) -> Result<Session, String> {
    let mut state_guard = state.lock().unwrap();

    if !state_guard.is_recording {
        return Err("No active recording to stop.".to_string());
    }

    // Mark as not recording (this will stop the recording thread)
    state_guard.is_recording = false;

    // Calculate duration
    let duration = calculate_duration(&state_guard);

    // Wait a bit for the recording thread to finish collecting samples
    drop(state_guard);
    thread::sleep(std::time::Duration::from_millis(200));
    let state_guard = state.lock().unwrap();

    // Generate timestamp-based ID
    let timestamp = Utc::now();
    let id = timestamp.format("%Y-%m-%d_%H-%M-%S").to_string();

    // Save audio file
    let audio_path = save_audio_file(&id, &state_guard)?;

    // Attempt transcription
    let (transcript_path, preview, clipboard_copied) = process_transcription(&audio_path, &id);

    // Create session record
    let session = Session {
        id: id.clone(),
        timestamp: timestamp.to_rfc3339(),
        audio_path: format!("audio/{}.wav", id),
        duration,
        preview,
        transcript_path,
        clipboard_copied,
    };

    // Persist session to index
    add_session(session.clone())?;

    Ok(session)
}

/// Calculate recording duration from start time
fn calculate_duration(state: &crate::recording::state::RecordingState) -> f64 {
    if let Some(start_time) = state.start_time {
        let end_time = Utc::now();
        (end_time - start_time).num_milliseconds() as f64 / 1000.0
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

    // Run transcription
    let (transcript_path, transcript_text) = transcribe_with_whisper(&audio_path, session_id)?;

    // Update session with new transcript info
    session.transcript_path = transcript_path;
    session.preview = generate_preview(&transcript_text);

    // Save updated sessions
    save_sessions(&index)?;

    Ok(transcript_text)
}

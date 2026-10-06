//! The recording half of a session's life: start, pause, resume, cancel and
//! stop the microphone capture, and save the captured samples as a WAV.

use crate::recording::audio::{start_capture, write_wav_file};
use crate::recording::models::Session;
use crate::recording::session::storage::add_session;
use crate::recording::state::{RecordingStatus, SharedRecordingState};
use crate::recording::utils::get_storage_dir;
use chrono::Utc;
use std::thread;

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
///
/// `on_capture_stopped` runs as soon as the capture callback has stopped
/// collecting samples, before the WAV is written. It's where the stop cue
/// plays: anything audible from that point on stays out of the recording.
pub fn stop_recording(
    state: SharedRecordingState,
    on_capture_stopped: impl FnOnce(),
) -> Result<Session, String> {
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

    // The capture callback only stores samples while the status is
    // Recording, so from here on nothing new reaches the buffer.
    drop(state_guard);
    on_capture_stopped();

    // Wait a bit for the recording thread to finish collecting samples
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
        recording_quality: None,
    };

    // Persist initial session to index
    add_session(session.clone())?;

    Ok(session)
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

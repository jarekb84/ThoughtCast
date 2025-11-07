mod recording;

use recording::{RecordingState, RecordingStatus, Session, SessionIndex, SharedRecordingState, WhisperConfig};
use std::sync::{Arc, Mutex};
use tauri::State;

struct AppState {
    recording: SharedRecordingState,
}

#[tauri::command]
fn start_recording(state: State<AppState>) -> Result<(), String> {
    let recording_state = Arc::clone(&state.inner().recording);
    recording::start_recording(recording_state)
}

#[tauri::command]
fn pause_recording(state: State<AppState>) -> Result<(), String> {
    let recording_state = Arc::clone(&state.inner().recording);
    recording::pause_recording(recording_state)
}

#[tauri::command]
fn resume_recording(state: State<AppState>) -> Result<(), String> {
    let recording_state = Arc::clone(&state.inner().recording);
    recording::resume_recording(recording_state)
}

#[tauri::command]
fn cancel_recording(state: State<AppState>) -> Result<(), String> {
    let recording_state = Arc::clone(&state.inner().recording);
    recording::cancel_recording(recording_state)
}

#[tauri::command]
fn stop_recording(state: State<AppState>) -> Result<Session, String> {
    let recording_state = Arc::clone(&state.inner().recording);
    recording::stop_recording(recording_state)
}

#[tauri::command]
fn get_sessions() -> Result<SessionIndex, String> {
    recording::load_sessions()
}

#[tauri::command]
fn get_recording_duration(state: State<AppState>) -> Result<f64, String> {
    let recording_state = state.inner().recording.lock().unwrap();

    if !recording_state.is_active() {
        return Ok(0.0);
    }

    if let Some(start_time) = recording_state.start_time {
        let now = chrono::Utc::now();
        let total_elapsed_ms = (now - start_time).num_milliseconds();

        // Calculate total paused duration including current pause if active
        let mut total_paused_ms = recording_state.total_paused_duration_ms;
        if recording_state.status == RecordingStatus::Paused {
            if let Some(pause_start) = recording_state.pause_start_time {
                let current_pause_duration = (now - pause_start).num_milliseconds();
                total_paused_ms += current_pause_duration;
            }
        }

        let active_duration_ms = total_elapsed_ms - total_paused_ms;
        Ok(active_duration_ms as f64 / 1000.0)
    } else {
        Ok(0.0)
    }
}

#[tauri::command]
fn get_recording_status(state: State<AppState>) -> Result<RecordingStatus, String> {
    let recording_state = state.inner().recording.lock().unwrap();
    Ok(recording_state.status)
}

#[tauri::command]
fn get_audio_levels(state: State<AppState>) -> Result<Vec<f32>, String> {
    let recording_state = state.inner().recording.lock().unwrap();

    // Only return audio levels if actively recording (not paused or idle)
    if !recording_state.is_recording() {
        return Ok(vec![]);
    }

    let samples = Arc::clone(&recording_state.samples);
    drop(recording_state); // Release lock before calculation

    Ok(recording::get_audio_levels(samples))
}

#[tauri::command]
fn load_config() -> Result<WhisperConfig, String> {
    recording::load_config()
}

#[tauri::command]
fn load_transcript(session_id: String) -> Result<String, String> {
    recording::load_transcript(&session_id)
}

#[tauri::command]
fn copy_transcript_to_clipboard(session_id: String) -> Result<(), String> {
    // Load transcript from file
    let transcript = recording::load_transcript(&session_id)?;

    // Copy transcript to clipboard
    if transcript.is_empty() {
        return Err("No transcript available for this session".to_string());
    }

    recording::copy_to_clipboard(&transcript)
}

#[tauri::command]
fn retranscribe_session(session_id: String) -> Result<String, String> {
    recording::retranscribe_session(&session_id)
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app_state = AppState {
      recording: Arc::new(Mutex::new(RecordingState::new())),
  };

  tauri::Builder::default()
    .manage(app_state)
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Initialize storage directory
      recording::get_storage_dir()?;

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        start_recording,
        pause_recording,
        resume_recording,
        cancel_recording,
        stop_recording,
        get_sessions,
        get_recording_duration,
        get_recording_status,
        get_audio_levels,
        load_config,
        load_transcript,
        copy_transcript_to_clipboard,
        retranscribe_session,
        get_app_version
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

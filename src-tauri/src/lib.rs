mod recording;

use recording::{RecordingState, Session, SessionIndex, SharedRecordingState, WhisperConfig};
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

    if !recording_state.is_recording {
        return Ok(0.0);
    }

    if let Some(start_time) = recording_state.start_time {
        let now = chrono::Utc::now();
        let duration = (now - start_time).num_milliseconds() as f64 / 1000.0;
        Ok(duration)
    } else {
        Ok(0.0)
    }
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
        stop_recording,
        get_sessions,
        get_recording_duration,
        load_config,
        load_transcript,
        copy_transcript_to_clipboard,
        retranscribe_session
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

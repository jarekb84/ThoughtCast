mod app_menu;
mod recording;

use recording::{
    estimate_transcription_time, extract_transcription_stats, new_shared_progress,
    request_cancel_batch, AppConfig, BatchCompleteEvent, BatchEventEmitter, BatchProgress,
    BatchProgressEvent, PathKind, PathValidation, RecordingState, RecordingStatus, Session,
    SessionIndex, SharedBatchProgress, SharedRecordingState, StorageStats,
    TranscriptionCompleteEvent, TranscriptionErrorEvent, TranscriptionEstimate,
    TranscriptionResult,
};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};

struct AppState {
    recording: SharedRecordingState,
    batch_progress: SharedBatchProgress,
}

/// Adapter that bridges the batch worker's emitter trait to Tauri's event bus.
struct TauriBatchEmitter {
    app: tauri::AppHandle,
}

impl BatchEventEmitter for TauriBatchEmitter {
    fn emit_progress(&self, event: BatchProgressEvent) {
        let _ = self.app.emit("compression-batch-progress", event);
    }
    fn emit_complete(&self, event: BatchCompleteEvent) {
        let _ = self.app.emit("compression-batch-complete", event);
    }
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
fn stop_recording(state: State<AppState>, app: tauri::AppHandle) -> Result<Session, String> {
    let recording_state = Arc::clone(&state.inner().recording);

    // Stop recording and save audio (synchronous, fast operation)
    let session = recording::stop_recording(recording_state.clone())?;

    // Prepare data for async transcription
    let session_id = session.id.clone();
    let audio_path = recording::get_storage_dir()?.join(&session.audio_path);

    // Orchestrate async transcription with event emission callback
    recording::orchestrate_async_transcription(
        recording_state,
        session_id,
        audio_path,
        move |result| match result {
            TranscriptionResult::Success(updated_session) => {
                let _ = app.emit(
                    "transcription-complete",
                    TranscriptionCompleteEvent {
                        session: updated_session,
                    },
                );
            }
            TranscriptionResult::Compressed(compression_event) => {
                let _ = app.emit("session-audio-compressed", compression_event);
            }
            TranscriptionResult::Error { session_id, error } => {
                let _ = app.emit(
                    "transcription-error",
                    TranscriptionErrorEvent { session_id, error },
                );
            }
        },
    );

    Ok(session)
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
fn load_config() -> Result<AppConfig, String> {
    recording::load_config()
}

#[tauri::command]
fn save_config(config: AppConfig) -> Result<(), String> {
    recording::save_config(&config)
}

#[tauri::command]
fn validate_config_path(path: String, kind: PathKind) -> Result<PathValidation, String> {
    Ok(recording::validate_path(&path, kind))
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

#[tauri::command]
fn get_transcription_estimate(audio_duration_seconds: f64) -> Result<Option<TranscriptionEstimate>, String> {
    // Load sessions and extract transcription statistics
    let session_index = recording::load_sessions()?;
    let stats = extract_transcription_stats(&session_index.sessions);
    Ok(estimate_transcription_time(&stats, audio_duration_seconds))
}

#[tauri::command]
fn get_storage_stats() -> Result<StorageStats, String> {
    recording::collect_storage_stats()
}

#[tauri::command]
fn start_compression_batch(
    state: State<AppState>,
    app: tauri::AppHandle,
    threshold_days_override: Option<u32>,
) -> Result<(), String> {
    let progress = Arc::clone(&state.inner().batch_progress);
    let recording = Arc::clone(&state.inner().recording);
    let emitter = TauriBatchEmitter { app };
    recording::start_batch_compression(progress, recording, threshold_days_override, emitter)
}

#[tauri::command]
fn cancel_compression_batch(state: State<AppState>) -> Result<(), String> {
    let progress = Arc::clone(&state.inner().batch_progress);
    request_cancel_batch(progress)
}

#[tauri::command]
fn get_compression_progress(state: State<AppState>) -> Result<BatchProgress, String> {
    let guard = state
        .inner()
        .batch_progress
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app_state = AppState {
      recording: Arc::new(Mutex::new(RecordingState::new())),
      batch_progress: new_shared_progress(),
  };

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(app_state)
    .on_menu_event(|app, event| app_menu::handle_menu_event(app, event))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let menu = app_menu::build_app_menu(app.handle())?;
      app.set_menu(menu)?;

      // Initialize storage directory
      recording::get_storage_dir()?;

      // Best-effort: heal any session-index / disk drift left over by an
      // interrupted compression run from a previous session.
      match recording::repair_orphaned_session_references() {
          Ok(report) => {
              if report.session_paths_patched > 0 || report.stale_temp_files_removed > 0 {
                  log::info!(
                      "Orphan repair at startup: patched {} session paths, removed {} stale temp files",
                      report.session_paths_patched,
                      report.stale_temp_files_removed
                  );
              }
          }
          Err(e) => log::warn!("Orphan repair skipped: {}", e),
      }

      // Scenario 2 from the PRD: if the user has age-based compression
      // enabled, kick off a background sweep a few seconds after startup so
      // the rest of the app comes up snappily.
      if let Ok(config) = recording::load_config() {
          if config.audio_compression.compress_old_recordings_enabled
              && !config.ffmpeg_path.trim().is_empty()
          {
              let app_handle = app.handle().clone();
              std::thread::spawn(move || {
                  std::thread::sleep(std::time::Duration::from_secs(5));
                  if let Some(state) = app_handle.try_state::<AppState>() {
                      let emitter = TauriBatchEmitter {
                          app: app_handle.clone(),
                      };
                      let progress = Arc::clone(&state.batch_progress);
                      let recording = Arc::clone(&state.recording);
                      // Startup sweep uses the configured threshold (None = read from config).
                      if let Err(e) = recording::start_batch_compression(
                          progress, recording, None, emitter,
                      ) {
                          log::warn!("Startup compression sweep skipped: {}", e);
                      }
                  }
              });
          }
      }

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
        save_config,
        validate_config_path,
        load_transcript,
        copy_transcript_to_clipboard,
        retranscribe_session,
        get_app_version,
        get_transcription_estimate,
        get_storage_stats,
        start_compression_batch,
        cancel_compression_batch,
        get_compression_progress
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

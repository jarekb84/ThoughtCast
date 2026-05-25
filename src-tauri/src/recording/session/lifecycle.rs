use crate::recording::audio::{
    repair_partial_wav_header, start_capture, write_wav_file, RecordingCaptureFailedEvent,
};
use crate::recording::models::Session;
use crate::recording::session::storage::add_session;
use crate::recording::state::{RecordingStatus, SharedRecordingState};
use crate::recording::utils::get_storage_dir;
use chrono::Utc;
use std::path::{Path, PathBuf};
use std::thread;

/// Start a new recording session.
///
/// Generates the session ID up-front (so the streaming WAV writer in
/// `capture.rs` has a stable path to write to from the first sample) and preps
/// shared state atomically before spawning the capture thread.
///
/// `on_capture_failure` is invoked from the capture thread if the stream dies
/// mid-session (e.g. microphone disconnect, OS denies access, init failure) —
/// the workflow receives a `RecordingCaptureFailedEvent` containing any audio
/// that was captured up to the failure point so the user can still recover it.
pub fn start_recording<F>(state: SharedRecordingState, on_capture_failure: F) -> Result<(), String>
where
    F: Fn(RecordingCaptureFailedEvent) + Send + Sync + 'static,
{
    let now = Utc::now();
    let session_id = now.format("%Y-%m-%d_%H-%M-%S").to_string();

    {
        let mut state_guard = state.lock().unwrap();
        if state_guard.is_active() {
            return Err("Recording is already in progress.".to_string());
        }
        if let Ok(mut samples) = state_guard.samples.lock() {
            samples.clear();
        }
        state_guard.start_time = Some(now);
        state_guard.pause_start_time = None;
        state_guard.total_paused_duration_ms = 0;
        state_guard.status = RecordingStatus::Recording;
        // Capture-thread-published fields reset for the new session. We
        // discard the previous in-flight path (`take_for_reset` returns it)
        // because the prior session was already either stopped, cancelled,
        // or failed — those paths take ownership of their own cleanup.
        let _ = state_guard.capture.take_for_reset();
        state_guard.active_session_id = Some(session_id);
    }

    start_capture(state, on_capture_failure)
}

/// Pause the current recording session.
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

/// Resume a paused recording session. Continues audio capture from where it
/// was paused.
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

/// Cancel the current recording session.
///
/// Discards the recording without saving. No session entry is created.
///
/// **The in-flight WAV is NOT deleted** — it is moved to
/// `audio/.cancelled/<timestamp>_<id>.wav` so the user can recover from an
/// accidental cancel. The motivating incident: third-party paths (global
/// keyboard shortcuts firing OS-wide while the window was unfocused, or HMR
/// edge cases in dev mode) can call cancel without the user's intent. A pure
/// unlink at that point is unrecoverable; moving to a quarantine directory
/// preserves the audio for manual recovery while still keeping the startup
/// scan from re-surfacing it as a "recovered" session.
pub fn cancel_recording(state: SharedRecordingState) -> Result<(), String> {
    let in_flight_to_quarantine: Option<PathBuf>;
    let session_id_for_log: Option<String>;
    {
        let mut state_guard = state.lock().unwrap();

        if !state_guard.is_active() {
            log::info!(
                "cancel_recording invoked while not active (status={:?}); no-op",
                state_guard.status
            );
            return Err("No active recording to cancel.".to_string());
        }

        session_id_for_log = state_guard.active_session_id.clone();
        log::warn!(
            "cancel_recording fired (session_id={:?}, status={:?}, samples={})",
            session_id_for_log,
            state_guard.status,
            state_guard
                .samples
                .lock()
                .map(|s| s.len())
                .unwrap_or(usize::MAX)
        );

        // Reset to idle state
        state_guard.status = RecordingStatus::Idle;
        state_guard.start_time = None;
        state_guard.pause_start_time = None;
        state_guard.total_paused_duration_ms = 0;

        // Clear samples
        if let Ok(mut samples) = state_guard.samples.lock() {
            samples.clear();
        }

        in_flight_to_quarantine = state_guard.capture.take_for_reset();
        state_guard.active_session_id = None;
    }

    // Give the capture thread the same 200 ms it gets on Stop to finalize and
    // release the file handle before we try to move the file. Without this,
    // the rename can race the writer on Windows.
    thread::sleep(std::time::Duration::from_millis(200));

    if let Some(path) = in_flight_to_quarantine {
        if path.exists() {
            match quarantine_cancelled_recording(&path, session_id_for_log.as_deref()) {
                Ok(dest) => log::info!(
                    "Moved cancelled in-flight WAV to quarantine: {}",
                    dest.display()
                ),
                Err(e) => log::warn!(
                    "Failed to quarantine cancelled in-flight WAV at {}: {}",
                    path.display(),
                    e
                ),
            }
        }
    }

    Ok(())
}

/// Move a cancelled in-flight WAV to `audio/.cancelled/<timestamp>_<id>.wav`.
///
/// Filenames carry the cancel timestamp first so a directory listing is
/// chronological. The original session id is preserved as a suffix so the
/// user can correlate with the recording they expected.
fn quarantine_cancelled_recording(
    in_flight_path: &Path,
    session_id: Option<&str>,
) -> Result<PathBuf, String> {
    let storage_dir = get_storage_dir()?;
    let cancelled_dir = storage_dir.join("audio").join(".cancelled");
    std::fs::create_dir_all(&cancelled_dir).map_err(|e| {
        format!(
            "Failed to create cancelled-recordings dir {}: {}",
            cancelled_dir.display(),
            e
        )
    })?;

    let cancel_stamp = Utc::now().format("%Y-%m-%d_%H-%M-%S");
    let original_id = session_id
        .or_else(|| {
            in_flight_path
                .file_stem()
                .and_then(|s| s.to_str())
        })
        .unwrap_or("unknown");
    let dest = cancelled_dir.join(format!("{}_{}.wav", cancel_stamp, original_id));

    std::fs::rename(in_flight_path, &dest).map_err(|e| {
        format!(
            "Failed to move {} → {}: {}",
            in_flight_path.display(),
            dest.display(),
            e
        )
    })?;

    Ok(dest)
}

/// Stop the current recording session and save the audio.
///
/// This is the first phase of the stop workflow:
/// 1. Stops audio capture
/// 2. Promotes the streaming writer's in-flight WAV to `audio/<id>.wav`
///    (fallback: writes the samples buffer if no in-flight WAV exists)
/// 3. Creates initial session record (without transcription)
/// 4. Returns session info for async transcription
///
/// Transcription happens asynchronously via
/// `transcription_orchestration::orchestrate_async_transcription`.
///
/// Can be called from Recording or Paused state.
pub fn stop_recording(state: SharedRecordingState) -> Result<Session, String> {
    let id: String;
    let timestamp = Utc::now();
    let duration: f64;
    let in_flight_path: Option<PathBuf>;

    {
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

        duration = calculate_duration(&state_guard);

        // Use the session id we generated at `start_recording` time so the
        // streaming WAV's filename matches the session row. Fall back to a
        // fresh timestamp only if we somehow lost it (defensive — should not
        // happen on the normal flow).
        id = state_guard
            .active_session_id
            .clone()
            .unwrap_or_else(|| timestamp.format("%Y-%m-%d_%H-%M-%S").to_string());

        // Mark as processing — the capture thread sees this and exits its
        // loop, draining any pending samples + finalizing the WAV header
        // before releasing the file handle.
        state_guard.status = RecordingStatus::Processing;
        in_flight_path = state_guard.capture.in_flight_audio_path.clone();
    }

    // Wait a bit for the recording thread to finish writing + finalize the
    // streaming WAV so the rename below sees a settled file with the OS
    // handle released.
    thread::sleep(std::time::Duration::from_millis(200));

    let audio_relative = save_recording_audio(&state, &id, in_flight_path.as_deref())?;

    {
        let mut state_guard = state.lock().unwrap();
        let _ = state_guard.capture.take_for_reset();
        state_guard.active_session_id = None;
    }

    // Create initial session record (transcription will be added later)
    let session = Session::new_for_processing(id.clone(), timestamp.to_rfc3339(), audio_relative, duration);

    // Persist initial session to index
    add_session(session.clone())?;

    Ok(session)
}

/// Resolve the final on-disk audio for a stopped recording.
///
/// Happy path: promote the streaming writer's in-flight WAV to its permanent
/// location with a rename — no second pass over the samples needed.
///
/// Fallback: if there's no in-flight WAV (capture thread failed to start the
/// writer, or this is a code path that pre-dates the streaming writer), fall
/// back to writing the samples buffer from RAM via the existing
/// `write_wav_file` path. Keeps the stop flow correct even when the
/// durability layer can't engage.
///
/// Returns the storage-relative audio path (`audio/<id>.wav`) for the
/// `Session` row.
fn save_recording_audio(
    state: &SharedRecordingState,
    id: &str,
    in_flight_path: Option<&Path>,
) -> Result<String, String> {
    let storage_dir = get_storage_dir()?;
    let audio_relative = format!("audio/{}.wav", id);
    let permanent_path: PathBuf = storage_dir.join(&audio_relative);

    if let Some(parent) = permanent_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create audio dir {}: {}", parent.display(), e))?;
    }

    if let Some(in_flight) = in_flight_path {
        if in_flight.exists() {
            // Repair the header before promoting so any samples written
            // between the last periodic flush and the capture thread's
            // finalize are still readable in the permanent file.
            if let Err(e) = repair_partial_wav_header(in_flight) {
                log::warn!(
                    "Header repair failed for in-flight WAV {} (continuing): {}",
                    in_flight.display(),
                    e
                );
            }
            std::fs::rename(in_flight, &permanent_path).map_err(|e| {
                format!(
                    "Failed to promote in-flight WAV {} → {}: {}",
                    in_flight.display(),
                    permanent_path.display(),
                    e
                )
            })?;
            return Ok(audio_relative);
        }
        log::warn!(
            "Expected in-flight WAV at {} but it was missing; falling back to in-memory save",
            in_flight.display()
        );
    }

    // Fallback: write from the samples buffer. This preserves the
    // pre-streaming behavior for whatever edge cases the capture thread
    // didn't get to set up the writer.
    let state_guard = state.lock().unwrap();
    let _ = save_audio_file(id, &state_guard)?;
    Ok(audio_relative)
}

/// Calculate recording duration from start time, excluding paused time.
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

/// Save recorded audio samples to a WAV file (fallback when no in-flight WAV
/// is present — see `save_recording_audio`).
///
/// Uses the device-reported sample rate the audio thread published on the
/// state. Falls back to 44.1 kHz only if the audio thread hasn't populated it
/// — which would mean capture initialization failed, in which case the
/// samples buffer is empty and the rate is irrelevant.
fn save_audio_file(
    id: &str,
    state: &crate::recording::state::RecordingState,
) -> Result<PathBuf, String> {
    let storage_dir = get_storage_dir()?;
    let audio_filename = format!("{}.wav", id);
    let audio_path = storage_dir.join("audio").join(&audio_filename);

    let sample_rate = state.capture.sample_rate.unwrap_or(44_100);
    let samples = state.samples.lock().unwrap();
    write_wav_file(&samples, &audio_path, sample_rate)?;

    Ok(audio_path)
}

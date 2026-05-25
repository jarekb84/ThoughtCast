use crate::recording::audio::streaming_writer::repair_partial_wav_header;
use crate::recording::audio::write_wav_file;
use crate::recording::models::{Session, CAPTURE_FAILURE_PREVIEW};
use crate::recording::session::storage::add_session;
use crate::recording::state::{RecordingStatus, SharedRecordingState};
use crate::recording::utils::get_storage_dir;
use chrono::Utc;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Callback invoked by the capture thread when audio capture fails mid-stream
/// (CPAL `err_fn` fires) or fails to initialize. Carries the partial-save
/// event so the caller can forward it to the frontend.
///
/// The callback is invoked from the spawned audio thread, on its way to
/// shutdown — implementations should be cheap and non-blocking (e.g. emit a
/// Tauri event and return).
pub type CaptureFailureCallback =
    Arc<dyn Fn(RecordingCaptureFailedEvent) + Send + Sync + 'static>;

/// Run the partial-save + event-emit + state-reset sequence after a capture
/// failure. Shared between init failures (returned `Err` from the capture
/// loop) and mid-stream failures (signalled via `state.capture.capture_error`).
///
/// After this returns, `state.status` is `Idle` so the next `start_capture`
/// can proceed without a residual "already recording" error.
pub fn propagate_capture_failure(
    state: &SharedRecordingState,
    reason: String,
    on_failure: &CaptureFailureCallback,
) {
    let event = build_capture_failure_event(state, reason);

    // Reset state before emitting so the workflow's reconciliation tick (if it
    // races us) sees an authoritative `idle` instead of a half-set state.
    if let Ok(mut state_guard) = state.lock() {
        state_guard.status = RecordingStatus::Idle;
        state_guard.start_time = None;
        state_guard.pause_start_time = None;
        state_guard.total_paused_duration_ms = 0;
        let _ = state_guard.capture.take_for_reset();
        state_guard.active_session_id = None;
    }

    on_failure(event);
}

/// Event emitted to the frontend when the audio capture path fails mid-stream.
///
/// `recovered_session` is `Some` when we managed to flush whatever was buffered
/// to disk and add it to the session index — the user can then open it and
/// retranscribe. `recovered_session` is `None` if the failure happened before
/// any samples were captured (or if the partial save itself failed); the UI
/// should still surface the warning so the user knows the recording is gone.
#[derive(Debug, Clone, serde::Serialize)]
pub struct RecordingCaptureFailedEvent {
    pub reason: String,
    pub partial_duration_seconds: f64,
    pub recovered_session: Option<Session>,
}

/// Build a `RecordingCaptureFailedEvent` from a failed capture session: best-
/// effort save whatever is in the samples buffer and register it as a session
/// so the user can retranscribe.
///
/// "Best-effort" is the operative word — any failure inside this function
/// (storage dir unavailable, disk full, sessions index corrupt) downgrades to
/// `recovered_session: None` rather than escalating. The capture thread is
/// already in an error path; bubbling another failure would only hide the
/// original `reason` from the user.
pub fn build_capture_failure_event(
    state: &SharedRecordingState,
    reason: String,
) -> RecordingCaptureFailedEvent {
    let snapshot = snapshot_recording_for_failure(state);

    // Prefer promoting the streaming writer's in-flight WAV over re-writing
    // the samples buffer. The in-flight WAV has been periodically header-
    // flushed, so even a crash at the worst possible moment leaves at most
    // a couple of seconds of audio loss — and we don't pay for a duplicate
    // 16-bit encoding pass on hundreds of MB of samples.
    let recovered_session = match promote_in_flight_to_session(state, &snapshot) {
        Ok(session) => Some(session),
        Err(promote_err) => {
            log::warn!(
                "Could not recover from in-flight WAV (reason='{}'): {}; falling back to in-memory save",
                reason,
                promote_err
            );
            match attempt_partial_save(state, &snapshot) {
                Ok(session) => Some(session),
                Err(save_err) => {
                    log::warn!(
                        "Capture failure partial save failed (reason='{}', save_error='{}')",
                        reason,
                        save_err
                    );
                    None
                }
            }
        }
    };

    RecordingCaptureFailedEvent {
        reason,
        partial_duration_seconds: snapshot.duration_seconds,
        recovered_session,
    }
}

/// Promote the active streaming WAV to a permanent session row. Uses the
/// in-flight path + session id from shared state; on success, the file ends
/// up at `audio/<id>.wav` and a `Session` is added to the index.
///
/// Fails gracefully (and the caller falls back to the from-samples path)
/// when there is no in-flight WAV — e.g. the capture thread died before it
/// could create the writer.
fn promote_in_flight_to_session(
    state: &SharedRecordingState,
    snapshot: &CaptureSnapshot,
) -> Result<Session, String> {
    let (in_flight_path, id) = {
        let g = state
            .lock()
            .map_err(|e| format!("Recording state poisoned: {}", e))?;
        let path = g
            .capture
            .in_flight_audio_path
            .clone()
            .ok_or_else(|| "No in-flight audio path".to_string())?;
        let id = g
            .active_session_id
            .clone()
            .ok_or_else(|| "No active session id".to_string())?;
        (path, id)
    };

    if !in_flight_path.exists() {
        return Err(format!(
            "In-flight WAV expected at {} but missing",
            in_flight_path.display()
        ));
    }

    // The capture thread already calls `finalize` before invoking the
    // failure path, but a header repair is cheap insurance against any
    // crash that happened between flush ticks and never made it through
    // `finalize`.
    repair_partial_wav_header(&in_flight_path)?;

    let permanent = promote_streaming_wav_to_permanent(&in_flight_path, &id)?;

    // Use whatever duration the WAV file itself reports. Snapshot duration
    // is computed from wall-clock and may diverge from the audio actually
    // captured.
    let duration = crate::recording::audio::read_wav_duration_seconds(&permanent)
        .unwrap_or(snapshot.duration_seconds);

    let session = Session::new_unrecovered(
        id.clone(),
        Utc::now().to_rfc3339(),
        format!("audio/{}.wav", id),
        duration,
        CAPTURE_FAILURE_PREVIEW.to_string(),
    );

    add_session(session.clone())?;
    Ok(session)
}

/// Move an in-flight WAV to its permanent `audio/<id>.wav` location.
///
/// Public so the normal stop path (in `session/lifecycle.rs`) and startup
/// recovery (in `recording/recovery.rs`) reuse the same promotion logic.
pub fn promote_streaming_wav_to_permanent(
    in_flight_path: &Path,
    session_id: &str,
) -> Result<PathBuf, String> {
    let storage_dir = get_storage_dir()?;
    let permanent = storage_dir
        .join("audio")
        .join(format!("{}.wav", session_id));
    if let Some(parent) = permanent.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create audio dir {}: {}", parent.display(), e))?;
    }
    std::fs::rename(in_flight_path, &permanent).map_err(|e| {
        format!(
            "Failed to promote in-flight WAV {} → {}: {}",
            in_flight_path.display(),
            permanent.display(),
            e
        )
    })?;
    Ok(permanent)
}

struct CaptureSnapshot {
    /// Frames captured before the failure, in f32 mono.
    samples: Vec<f32>,
    /// Sample rate the device was running at, if the audio thread had time to
    /// publish it before failing. Falls back to 44.1 kHz so any partial save
    /// is at least playable (just slightly mis-timed).
    sample_rate: u32,
    /// Recording duration (excluding paused time) at the moment of failure.
    /// Drives the user-facing "we saved X:XX" message and the persisted
    /// `session.duration`.
    duration_seconds: f64,
}

/// Take a consistent snapshot of the recording state for failure handling.
///
/// We pull `samples`, `sample_rate`, and `duration` under the same lock so
/// the trio is internally consistent — the capture callback may still be
/// running on another thread, and we don't want the published duration to
/// disagree with the samples count we save.
fn snapshot_recording_for_failure(state: &SharedRecordingState) -> CaptureSnapshot {
    let Ok(state_guard) = state.lock() else {
        // Lock poisoning is rare and unrecoverable here — return an empty
        // snapshot so the caller can still emit a "no audio recovered" event.
        return CaptureSnapshot {
            samples: Vec::new(),
            sample_rate: 44_100,
            duration_seconds: 0.0,
        };
    };

    let samples = state_guard
        .samples
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default();

    let sample_rate = state_guard.capture.sample_rate.unwrap_or(44_100);
    let duration_seconds = duration_at_failure(&state_guard);

    CaptureSnapshot {
        samples,
        sample_rate,
        duration_seconds,
    }
}

/// Duration helper local to the failure path so we don't need to make
/// `lifecycle::calculate_duration` public for one caller.
fn duration_at_failure(state: &crate::recording::state::RecordingState) -> f64 {
    let Some(start_time) = state.start_time else {
        return 0.0;
    };
    let now = Utc::now();
    let total_elapsed_ms = (now - start_time).num_milliseconds();

    let mut total_paused_ms = state.total_paused_duration_ms;
    if state.status == crate::recording::state::RecordingStatus::Paused {
        if let Some(pause_start) = state.pause_start_time {
            total_paused_ms += (now - pause_start).num_milliseconds();
        }
    }

    let active_ms = total_elapsed_ms - total_paused_ms;
    if active_ms <= 0 {
        0.0
    } else {
        active_ms as f64 / 1000.0
    }
}

/// Write the snapshot's samples to a fresh session WAV and register the
/// session in the index. Returns the new `Session` (with a sentinel preview
/// telling the user this was a partial save) on success.
fn attempt_partial_save(
    state: &SharedRecordingState,
    snapshot: &CaptureSnapshot,
) -> Result<Session, String> {
    if snapshot.samples.is_empty() {
        // Nothing to save — the failure happened before any audio was
        // captured. The caller will emit the event with `recovered_session:
        // None` so the UI can still surface the warning.
        return Err("No audio captured before failure".to_string());
    }

    let storage_dir = get_storage_dir()?;
    let id = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let audio_relative = format!("audio/{}.wav", id);
    let audio_path: PathBuf = storage_dir.join(&audio_relative);

    write_wav_file(&snapshot.samples, &audio_path, snapshot.sample_rate)?;

    let session = Session::new_unrecovered(
        id,
        Utc::now().to_rfc3339(),
        audio_relative,
        snapshot.duration_seconds,
        CAPTURE_FAILURE_PREVIEW.to_string(),
    );

    add_session(session.clone())?;

    // Drop the in-memory samples now that they are durably on disk so a
    // subsequent retry of `start_capture` starts with a clean buffer.
    if let Ok(state_guard) = state.lock() {
        if let Ok(mut samples) = state_guard.samples.lock() {
            samples.clear();
        }
    }

    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_duration_at_failure_returns_zero_without_start_time() {
        let state = crate::recording::state::RecordingState::new();
        assert_eq!(duration_at_failure(&state), 0.0);
    }

    #[test]
    fn test_duration_at_failure_handles_negative_clamp() {
        // Pathological case: start_time in the future (clock skew). Result
        // should be clamped to 0 rather than negative.
        let mut state = crate::recording::state::RecordingState::new();
        state.start_time = Some(Utc::now() + chrono::Duration::seconds(5));
        let d = duration_at_failure(&state);
        assert!(d >= 0.0, "expected non-negative duration, got {}", d);
    }
}

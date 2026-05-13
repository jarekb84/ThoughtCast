use super::batch_state::{BatchProgress, BatchStatus, SharedBatchProgress};
use super::disk_space_guard::audio_dir_is_writable;
use super::{
    compress_wav_to_m4a, errors::CompressionError, is_session_compressible,
    replace_wav_with_compressed,
};
use crate::recording::config::load_config;
use crate::recording::session::storage::load_sessions;
use crate::recording::state::SharedRecordingState;
use crate::recording::utils::get_storage_dir;
use chrono::Utc;
use serde::Serialize;
use std::path::PathBuf;
use std::thread;

/// Final summary emitted when a batch run completes (or is cancelled).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCompleteEvent {
    pub total: u32,
    pub compressed: u32,
    pub skipped: u32,
    pub bytes_freed: u64,
    pub cancelled: bool,
}

/// Per-file progress tick emitted as the worker advances through the batch.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchProgressEvent {
    pub total: u32,
    pub current_index: u32,
    pub current_file: Option<String>,
    pub bytes_freed: u64,
}

/// Callbacks the worker invokes for progress and completion events. The
/// Tauri command layer wires these to `app.emit(...)`.
pub trait BatchEventEmitter: Send + 'static {
    fn emit_progress(&self, event: BatchProgressEvent);
    fn emit_complete(&self, event: BatchCompleteEvent);
}

/// Spawn the batch compression worker on a background thread.
///
/// Idempotent — if a run is already in flight, returns `Err`. Otherwise marks
/// `progress.status = Running` synchronously before returning so callers can
/// rely on the state having transitioned.
///
/// `threshold_days_override`:
/// - `None`  → use `config.audioCompression.compressOldRecordingsOlderThanDays`
///   (the automatic / scheduled sweep path)
/// - `Some(n)` → bypass the config and treat any session older than `n` days
///   as eligible. `Some(0)` means "every uncompressed WAV is eligible", which
///   is what the in-app "Compress all WAV files" button uses.
pub fn start_batch_compression<E: BatchEventEmitter>(
    progress: SharedBatchProgress,
    recording_state: SharedRecordingState,
    threshold_days_override: Option<u32>,
    emitter: E,
) -> Result<(), String> {
    {
        let mut guard = progress.lock().map_err(|e| e.to_string())?;
        if guard.status != BatchStatus::Idle {
            return Err("A compression batch is already running".to_string());
        }
        *guard = BatchProgress {
            status: BatchStatus::Running,
            total: 0,
            current_index: 0,
            current_file: None,
            bytes_freed: 0,
            skipped: 0,
            compressed: 0,
        };
    }

    thread::spawn(move || {
        let result = run_batch(&progress, &recording_state, threshold_days_override, &emitter);
        finalize_batch(&progress, &emitter, result);
    });

    Ok(())
}

/// Signal an in-flight batch to stop as soon as it finishes the current file.
pub fn request_cancel_batch(progress: SharedBatchProgress) -> Result<(), String> {
    let mut guard = progress.lock().map_err(|e| e.to_string())?;
    if guard.status == BatchStatus::Running {
        guard.status = BatchStatus::Cancelling;
    }
    Ok(())
}

#[derive(Debug)]
struct BatchTally {
    total: u32,
    compressed: u32,
    skipped: u32,
    bytes_freed: u64,
    cancelled: bool,
}

fn run_batch<E: BatchEventEmitter>(
    progress: &SharedBatchProgress,
    recording_state: &SharedRecordingState,
    threshold_days_override: Option<u32>,
    emitter: &E,
) -> Result<BatchTally, String> {
    if !audio_dir_is_writable() {
        return Err("Audio directory is not writable — cannot start batch".to_string());
    }

    let config = load_config()?;
    let threshold_days = threshold_days_override.unwrap_or(
        config.audio_compression.compress_old_recordings_older_than_days,
    );
    let ffmpeg_path = config.ffmpeg_path.clone();

    let storage_dir = get_storage_dir()?;
    let session_index = load_sessions()?;
    let now = Utc::now();

    let busy_ids: std::collections::HashSet<String> = recording_state
        .lock()
        .ok()
        .map(|s| {
            let mut set = s.transcribing_session_ids.clone();
            if let Some(id) = s.active_session_id.clone() {
                set.insert(id);
            }
            set
        })
        .unwrap_or_default();

    let eligible: Vec<_> = session_index
        .sessions
        .iter()
        .filter(|s| {
            if busy_ids.contains(&s.id) {
                return false;
            }
            is_session_compressible(s, None, threshold_days, now).is_eligible()
        })
        .cloned()
        .collect();

    {
        let mut guard = progress.lock().map_err(|e| e.to_string())?;
        guard.total = eligible.len() as u32;
    }

    let mut tally = BatchTally {
        total: eligible.len() as u32,
        compressed: 0,
        skipped: 0,
        bytes_freed: 0,
        cancelled: false,
    };

    for (i, session) in eligible.iter().enumerate() {
        if check_cancelled(progress) {
            tally.cancelled = true;
            break;
        }

        let current_index = (i as u32) + 1;
        let current_file_name = current_file_label(&session.audio_path);
        update_progress(progress, |p| {
            p.current_index = current_index;
            p.current_file = Some(current_file_name.clone());
        });

        emitter.emit_progress(BatchProgressEvent {
            total: tally.total,
            current_index,
            current_file: Some(current_file_name.clone()),
            bytes_freed: tally.bytes_freed,
        });

        let wav_absolute = storage_dir.join(&session.audio_path);
        let mut temp_m4a = wav_absolute.clone();
        temp_m4a.set_extension("m4a.tmp");

        match compress_single_session(&ffmpeg_path, &wav_absolute, &temp_m4a, &session.id, &session.audio_path) {
            Ok(freed) => {
                tally.compressed += 1;
                tally.bytes_freed += freed;
                update_progress(progress, |p| {
                    p.compressed += 1;
                    p.bytes_freed += freed;
                });
            }
            Err(e) => {
                log::warn!(
                    "Batch compression: skipped {} ({})",
                    session.id,
                    e
                );
                cleanup_temp_file(&temp_m4a);
                tally.skipped += 1;
                update_progress(progress, |p| {
                    p.skipped += 1;
                });
            }
        }
    }

    // Emit a final progress tick so the UI can reflect 100% before the
    // complete event.
    emitter.emit_progress(BatchProgressEvent {
        total: tally.total,
        current_index: tally.total,
        current_file: None,
        bytes_freed: tally.bytes_freed,
    });

    Ok(tally)
}

fn compress_single_session(
    ffmpeg_path: &str,
    wav_absolute: &PathBuf,
    temp_m4a: &PathBuf,
    session_id: &str,
    audio_relative: &str,
) -> Result<u64, CompressionError> {
    compress_wav_to_m4a(ffmpeg_path, wav_absolute, temp_m4a)?;
    let outcome = replace_wav_with_compressed(session_id, audio_relative, temp_m4a)?;
    Ok(outcome.wav_bytes_before.saturating_sub(outcome.m4a_bytes_after))
}

fn cleanup_temp_file(temp_m4a: &PathBuf) {
    if temp_m4a.exists() {
        let _ = std::fs::remove_file(temp_m4a);
    }
}

fn finalize_batch<E: BatchEventEmitter>(
    progress: &SharedBatchProgress,
    emitter: &E,
    result: Result<BatchTally, String>,
) {
    let tally = match result {
        Ok(t) => t,
        Err(e) => {
            log::error!("Batch compression aborted: {}", e);
            BatchTally {
                total: 0,
                compressed: 0,
                skipped: 0,
                bytes_freed: 0,
                cancelled: false,
            }
        }
    };

    if let Ok(mut guard) = progress.lock() {
        guard.status = BatchStatus::Idle;
        guard.current_file = None;
    }

    emitter.emit_complete(BatchCompleteEvent {
        total: tally.total,
        compressed: tally.compressed,
        skipped: tally.skipped,
        bytes_freed: tally.bytes_freed,
        cancelled: tally.cancelled,
    });
}

fn check_cancelled(progress: &SharedBatchProgress) -> bool {
    progress
        .lock()
        .map(|g| g.status == BatchStatus::Cancelling)
        .unwrap_or(false)
}

fn update_progress<F: FnOnce(&mut BatchProgress)>(progress: &SharedBatchProgress, f: F) {
    if let Ok(mut guard) = progress.lock() {
        f(&mut guard);
    }
}

fn current_file_label(audio_path: &str) -> String {
    PathBuf::from(audio_path)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| audio_path.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_current_file_label_extracts_basename() {
        assert_eq!(
            current_file_label("audio/2024-11-02_15-30-00.wav"),
            "2024-11-02_15-30-00.wav"
        );
    }

    #[test]
    fn test_current_file_label_falls_back_when_no_filename() {
        // For a path that's all slashes, fall back to the raw input.
        assert_eq!(current_file_label(""), "");
    }
}

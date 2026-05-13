use serde::Serialize;
use std::sync::{Arc, Mutex};

/// High-level lifecycle of the batch compression worker. The frontend
/// transitions UI between dialogs based on this value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BatchStatus {
    Idle,
    Running,
    Cancelling,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchProgress {
    pub status: BatchStatus,
    pub total: u32,
    pub current_index: u32,
    pub current_file: Option<String>,
    pub bytes_freed: u64,
    pub skipped: u32,
    pub compressed: u32,
}

impl BatchProgress {
    pub fn idle() -> Self {
        Self {
            status: BatchStatus::Idle,
            total: 0,
            current_index: 0,
            current_file: None,
            bytes_freed: 0,
            skipped: 0,
            compressed: 0,
        }
    }
}

/// Thread-safe handle to the batch worker's progress. Wrapped in `Arc<Mutex<>>`
/// so the Tauri command layer can read the current snapshot (for fallback
/// polling) while the worker thread mutates it.
pub type SharedBatchProgress = Arc<Mutex<BatchProgress>>;

pub fn new_shared_progress() -> SharedBatchProgress {
    Arc::new(Mutex::new(BatchProgress::idle()))
}

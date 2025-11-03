use chrono::{DateTime, Utc};
use serde::Serialize;
use std::sync::{Arc, Mutex};

/// Recording status representing the current state of the recording session
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecordingStatus {
    Idle,
    Recording,
    Paused,
}

/// The state of an active recording session
///
/// Manages the recording status, audio samples buffer, and timing information
/// including support for pause/resume functionality
pub struct RecordingState {
    pub status: RecordingStatus,
    pub samples: Arc<Mutex<Vec<f32>>>,
    pub start_time: Option<DateTime<Utc>>,
    pub pause_start_time: Option<DateTime<Utc>>,
    pub total_paused_duration_ms: i64,
}

impl RecordingState {
    pub fn new() -> Self {
        RecordingState {
            status: RecordingStatus::Idle,
            samples: Arc::new(Mutex::new(Vec::new())),
            start_time: None,
            pause_start_time: None,
            total_paused_duration_ms: 0,
        }
    }

    /// Check if currently recording (not idle or paused)
    pub fn is_recording(&self) -> bool {
        self.status == RecordingStatus::Recording
    }

    /// Check if recording session is active (recording or paused, but not idle)
    pub fn is_active(&self) -> bool {
        matches!(self.status, RecordingStatus::Recording | RecordingStatus::Paused)
    }
}

impl Default for RecordingState {
    fn default() -> Self {
        Self::new()
    }
}

/// Type alias for thread-safe shared recording state
pub type SharedRecordingState = Arc<Mutex<RecordingState>>;

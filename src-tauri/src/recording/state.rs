use chrono::{DateTime, Utc};
use std::sync::{Arc, Mutex};

/// The state of an active recording session
///
/// Manages the recording flag, audio samples buffer, and timing information
pub struct RecordingState {
    pub is_recording: bool,
    pub samples: Arc<Mutex<Vec<f32>>>,
    pub start_time: Option<DateTime<Utc>>,
}

impl RecordingState {
    pub fn new() -> Self {
        RecordingState {
            is_recording: false,
            samples: Arc::new(Mutex::new(Vec::new())),
            start_time: None,
        }
    }
}

impl Default for RecordingState {
    fn default() -> Self {
        Self::new()
    }
}

/// Type alias for thread-safe shared recording state
pub type SharedRecordingState = Arc<Mutex<RecordingState>>;

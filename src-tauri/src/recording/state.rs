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
    Processing,
}

/// The state of an active recording session
///
/// Manages the recording status, audio samples buffer, and timing information
/// including support for pause/resume functionality.
///
/// `active_session_id` and `transcribing_session_ids` exist so the compression
/// worker can skip files that are mid-recording or mid-transcription. They
/// are populated by the session lifecycle and cleared on idle.
pub struct RecordingState {
    pub status: RecordingStatus,
    pub samples: Arc<Mutex<Vec<f32>>>,
    pub start_time: Option<DateTime<Utc>>,
    pub pause_start_time: Option<DateTime<Utc>>,
    pub total_paused_duration_ms: i64,
    pub active_session_id: Option<String>,
    pub transcribing_session_ids: std::collections::HashSet<String>,
    /// Device sample rate (Hz) for the current capture, populated by the audio
    /// thread once it has queried the input device. The WAV writer reads this
    /// at save time so the file's header matches the rate the samples were
    /// actually captured at — labelling them 44.1 kHz when CPAL ran at 48 kHz
    /// time-stretches playback by ~8.8% and silently truncates downstream
    /// chunked transcription.
    pub sample_rate: Option<u32>,
}

impl RecordingState {
    pub fn new() -> Self {
        RecordingState {
            status: RecordingStatus::Idle,
            samples: Arc::new(Mutex::new(Vec::new())),
            start_time: None,
            pause_start_time: None,
            total_paused_duration_ms: 0,
            active_session_id: None,
            transcribing_session_ids: std::collections::HashSet::new(),
            sample_rate: None,
        }
    }

    /// Check if currently recording (not idle, paused, or processing)
    pub fn is_recording(&self) -> bool {
        self.status == RecordingStatus::Recording
    }

    /// Check if recording session is active (recording or paused, but not idle or processing)
    pub fn is_active(&self) -> bool {
        matches!(
            self.status,
            RecordingStatus::Recording | RecordingStatus::Paused
        )
    }
}

impl Default for RecordingState {
    fn default() -> Self {
        Self::new()
    }
}

/// Type alias for thread-safe shared recording state
pub type SharedRecordingState = Arc<Mutex<RecordingState>>;

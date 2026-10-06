use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::PathBuf;
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

/// The audio-capture thread's published view of a recording session.
///
/// These four fields are produced by the capture thread (`audio/capture.rs`)
/// and consumed by lifecycle / failure / Tauri-command paths on other
/// threads. Grouping them in one struct makes the producer/consumer split
/// explicit and lets reset paths use `take_for_reset()` instead of touching
/// four separate fields by hand.
#[derive(Debug, Default)]
pub struct CaptureChannel {
    /// Device sample rate (Hz) for the current capture, populated by the audio
    /// thread once it has queried the input device. The WAV writer reads this
    /// at save time so the file's header matches the rate the samples were
    /// actually captured at — labelling them 44.1 kHz when CPAL ran at 48 kHz
    /// time-stretches playback by ~8.8% and silently truncates downstream
    /// chunked transcription.
    pub sample_rate: Option<u32>,
    /// Set by the CPAL stream error callback (or by capture-thread init
    /// failures) when audio capture dies mid-session. The capture loop polls
    /// this every 100 ms and, when populated, breaks out to run the partial-
    /// save / failure-event path. Cleared on next `start_capture`.
    pub capture_error: Option<String>,
    /// Path of the in-flight WAV the capture thread is streaming samples to.
    /// `Some` while a recording is active or paused; `None` otherwise.
    ///
    /// Capture failures, normal stops, and cancels all consult this so they
    /// can finalize / move / delete the file in one place. The path lives
    /// under `audio/.in-flight/<id>.wav` until Stop renames it to the
    /// permanent `audio/<id>.wav`.
    pub in_flight_audio_path: Option<PathBuf>,
    /// Total seconds of audio durably committed to the in-flight WAV's data
    /// chunk (and reflected in its on-disk header). Published by the capture
    /// thread every few seconds so the reconciliation tick can surface a
    /// "Saved through" trust signal in the UI — even mid-recording, the user
    /// sees that their audio is on disk, not just in RAM.
    pub flushed_through_seconds: Option<f64>,
}

impl CaptureChannel {
    pub fn new() -> Self {
        Self::default()
    }

    /// Reset all four fields and return the in-flight WAV path so the caller
    /// can clean it up (delete on cancel, rename on stop/failure). The path
    /// is taken with `Option::take` so a second call returns `None`.
    pub fn take_for_reset(&mut self) -> Option<PathBuf> {
        let path = self.in_flight_audio_path.take();
        self.sample_rate = None;
        self.capture_error = None;
        self.flushed_through_seconds = None;
        path
    }
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
    /// Capture-thread-published state (sample rate, in-flight WAV, etc.). See
    /// `CaptureChannel` for the producer/consumer rationale.
    pub capture: CaptureChannel,
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
            capture: CaptureChannel::new(),
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

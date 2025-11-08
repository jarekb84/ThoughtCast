// Core modules
mod audio;
mod config;
mod models;
mod session;
mod state;
mod statistics;
mod transcription;
mod utils;

// Public API exports

// Data models
pub use models::{
    Session, SessionIndex, TranscriptionCompleteEvent, TranscriptionErrorEvent, WhisperConfig,
};

// State management
pub use state::{RecordingState, RecordingStatus, SharedRecordingState};

// Configuration
pub use config::load_config;

// Session operations (main API surface)
pub use session::{
    cancel_recording, load_sessions, load_transcript, orchestrate_async_transcription,
    pause_recording, resume_recording, retranscribe_session, start_recording, stop_recording,
    TranscriptionResult,
};

// Utility functions
pub use utils::{copy_to_clipboard, get_storage_dir};

// Audio level calculation
pub use audio::get_audio_levels;

// Transcription statistics and estimation
pub use statistics::{estimate_transcription_time, extract_transcription_stats, TranscriptionEstimate};

// Note: Internal modules (audio, transcription) are kept private
// They are implementation details and should not be accessed directly from outside

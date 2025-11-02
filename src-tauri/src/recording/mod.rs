// Core modules
mod audio;
mod config;
mod models;
mod session;
mod state;
mod transcription;
mod utils;

// Public API exports

// Data models
pub use models::{Session, SessionIndex, WhisperConfig};

// State management
pub use state::{RecordingState, SharedRecordingState};

// Configuration
pub use config::load_config;

// Session operations (main API surface)
pub use session::{load_sessions, load_transcript, retranscribe_session, start_recording, stop_recording};

// Utility functions
pub use utils::{copy_to_clipboard, get_storage_dir};

// Note: Internal modules (audio, transcription) are kept private
// They are implementation details and should not be accessed directly from outside

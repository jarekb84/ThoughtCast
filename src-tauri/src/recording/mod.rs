// Core modules
mod audio;
mod chunking;
mod compression;
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
    AppConfig, AudioFeedbackConfig, Session, SessionIndex, TranscriptionCompleteEvent,
    TranscriptionErrorEvent,
};

// State management
pub use state::{RecordingState, RecordingStatus, SharedRecordingState};

// Configuration
pub use config::{load_config, save_config, validate_path, PathKind, PathValidation};

// Compression pipeline
pub use compression::{
    collect_storage_stats, new_shared_progress, repair_orphaned_session_references,
    request_cancel_batch, start_batch_compression, BatchCompleteEvent, BatchEventEmitter,
    BatchProgress, BatchProgressEvent, SharedBatchProgress, StorageStats,
};

// Session operations (main API surface)
pub use session::{
    cancel_recording, load_sessions, load_transcript, orchestrate_async_retranscription,
    orchestrate_async_transcription, pause_recording, resume_recording, start_recording,
    start_retranscription, stop_recording, TranscriptionResult,
};

// Utility functions
pub use utils::{copy_to_clipboard, get_storage_dir};

// Audio level calculation
pub use audio::get_audio_levels;

// Transcription statistics and estimation
pub use statistics::{estimate_transcription_time, extract_transcription_stats, TranscriptionEstimate};

// Note: Internal modules (audio, transcription) are kept private
// They are implementation details and should not be accessed directly from outside

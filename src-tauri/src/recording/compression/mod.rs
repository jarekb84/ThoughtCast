//! Audio compression module.
//!
//! Provides building blocks for WAV → M4A conversion:
//! - `ffmpeg_runner`: invokes FFmpeg as a subprocess
//! - `atomic_replace`: safely swaps a verified compressed file in for the original WAV
//! - `post_transcription`: one-shot compression entry-point called after a recording
//!   finishes transcribing
//! - `batch_worker` / `batch_state`: background sweep over existing recordings
//! - `eligibility`: pure logic deciding which session files can be compressed
//! - `storage_stats`: read-only reporting for the Settings UI
//! - `orphan_repair`: startup reconciliation of stray temp / mis-pointed index entries
//! - `disk_space_guard`: write-probe before kicking off a batch
//! - `errors`: a structured error type shared across the module

pub mod atomic_replace;
pub mod batch_state;
pub mod batch_worker;
pub mod disk_space_guard;
pub mod eligibility;
pub mod errors;
pub mod ffmpeg_runner;
pub mod orphan_repair;
pub mod post_transcription;
pub mod storage_stats;

pub use atomic_replace::{replace_wav_with_compressed, ReplacementOutcome};
pub use batch_state::{new_shared_progress, BatchProgress, SharedBatchProgress};
pub use batch_worker::{
    request_cancel_batch, start_batch_compression, BatchCompleteEvent, BatchEventEmitter,
    BatchProgressEvent,
};
pub use eligibility::is_session_compressible;
pub use ffmpeg_runner::compress_wav_to_m4a;
pub use orphan_repair::repair_orphaned_session_references;
pub use post_transcription::{run_post_transcription_compression, SessionAudioCompressedEvent};
pub use storage_stats::{collect_storage_stats, StorageStats};

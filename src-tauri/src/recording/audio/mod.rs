pub mod capture;
pub mod capture_failure;
pub mod level_calculator;
pub mod streaming_writer;
pub mod writer;

pub use capture::start_capture;
pub use capture_failure::{promote_streaming_wav_to_permanent, RecordingCaptureFailedEvent};
pub use level_calculator::get_audio_levels;
pub use streaming_writer::repair_partial_wav_header;
pub use writer::{read_wav_duration_seconds, write_wav_file};

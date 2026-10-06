pub mod audio_decoder;
pub mod chunked_orchestrator;
pub mod cli_capabilities;
pub mod cli_runner;
pub mod engine;
pub mod parakeet_cli;
pub mod repetition;
pub mod text_processor;
pub mod whisper_cli;

pub use audio_decoder::decode_to_wav;
pub use chunked_orchestrator::{transcribe_in_chunks, ChunkingTelemetry};
pub use engine::transcribe_file;
pub use text_processor::save_transcript;

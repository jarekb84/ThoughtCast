//! The one seam every transcription goes through: audio file in, cleaned text
//! out. The single-shot path and the per-chunk loop both call
//! `transcribe_file`, so engine choice and engine options live in one place.

use crate::recording::models::AppConfig;
use crate::recording::transcription::whisper_cli;
use std::path::Path;

/// Transcribe one audio file with the configured engine.
pub fn transcribe_file(audio_path: &Path, config: &AppConfig) -> Result<String, String> {
    whisper_cli::transcribe(audio_path, config)
}

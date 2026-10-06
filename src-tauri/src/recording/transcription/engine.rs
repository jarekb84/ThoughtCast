//! The one seam every transcription goes through: audio file in, cleaned text
//! out. The single-shot path and the per-chunk loop both call
//! `transcribe_file`, so engine choice and the repetition guard live here.

use crate::recording::models::{AppConfig, TranscriptionEngine};
use crate::recording::transcription::repetition::{collapse_loops, looped_word_count};
use crate::recording::transcription::whisper_cli::{self, ContextMode};
use crate::recording::transcription::parakeet_cli;
use std::path::Path;

/// Transcribe one audio file with the configured engine.
pub fn transcribe_file(audio_path: &Path, config: &AppConfig) -> Result<String, String> {
    let repair = config.transcription.repair_repetitions;
    match config.transcription.engine {
        TranscriptionEngine::Whisper if repair => transcribe_whisper_guarded(audio_path, config),
        TranscriptionEngine::Whisper => whisper_cli::transcribe(audio_path, config, ContextMode::Carry),
        TranscriptionEngine::Parakeet => parakeet_cli::transcribe(audio_path, config),
    }
}

/// Whisper with the repetition guard: when the first pass contains a loop,
/// run the audio again without carried context (which is what lets a loop
/// feed on itself), keep whichever attempt loops less, and remove any
/// repeats that survive.
fn transcribe_whisper_guarded(audio_path: &Path, config: &AppConfig) -> Result<String, String> {
    let first = whisper_cli::transcribe(audio_path, config, ContextMode::Carry)?;
    let first_looped = looped_word_count(&first);
    if first_looped == 0 {
        return Ok(first);
    }

    log::warn!(
        "Repetition loop ({} words) in {}; retrying without carried context",
        first_looped,
        audio_path.display()
    );
    let retry = whisper_cli::transcribe(audio_path, config, ContextMode::Fresh);
    if let Err(e) = &retry {
        log::warn!("Retry failed ({}); keeping the first attempt", e);
    }
    let best = pick_less_looped(first, retry.ok());
    Ok(collapse_loops(&best))
}

/// The retry wins only when it loops strictly less; ties keep the first
/// attempt, which had full context.
fn pick_less_looped(first: String, retry: Option<String>) -> String {
    match retry {
        Some(r) if looped_word_count(&r) < looped_word_count(&first) => r,
        _ => first,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn looped() -> String {
        format!("start of the note. {}end of the note.", "I'm not going to be able to do that. ".repeat(10))
    }

    #[test]
    fn test_retry_that_loops_less_wins() {
        let clean = "start of the note. something real was said here. end of the note.".to_string();
        assert_eq!(pick_less_looped(looped(), Some(clean.clone())), clean);
    }

    #[test]
    fn test_failed_or_equally_looped_retry_keeps_first() {
        assert_eq!(pick_less_looped(looped(), None), looped());
        assert_eq!(pick_less_looped(looped(), Some(looped())), looped());
    }

    #[test]
    fn test_unconfigured_engine_errors_instead_of_panicking() {
        let config = AppConfig::default();
        assert!(transcribe_file(Path::new("/a/chunk.wav"), &config).is_err());
    }
}

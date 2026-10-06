//! The one seam every transcription goes through: audio file in, cleaned text
//! out. The single-shot path and the per-chunk loop both call
//! `transcribe_file`, so engine choice and the repetition guard live here.

use crate::recording::models::{AppConfig, TranscriptionEngine};
use crate::recording::transcription::parakeet_cli;
use crate::recording::transcription::repetition::{collapse_loops, looped_word_count};
use crate::recording::transcription::whisper_cli::{self, vad_available, ContextMode, WhisperPass};
use std::path::Path;

/// Transcribe one audio file with the configured engine.
pub fn transcribe_file(audio_path: &Path, config: &AppConfig) -> Result<String, String> {
    match config.transcription.engine {
        TranscriptionEngine::Parakeet => parakeet_cli::transcribe(audio_path, config),
        TranscriptionEngine::Whisper if config.transcription.repair_repetitions => {
            let ladder = retry_ladder(vad_available(config));
            run_ladder(&ladder, |pass| whisper_cli::transcribe(audio_path, config, pass))
        }
        TranscriptionEngine::Whisper => {
            let pass = WhisperPass { context: ContextMode::Carry, vad: true };
            whisper_cli::transcribe(audio_path, config, pass)
        }
    }
}

/// Attempts in order, each tried only when every earlier one looped.
///
/// The first pass runs without VAD: measured on walking-around recordings,
/// VAD skips around 2% of real (quiet) speech, so it's kept for audio that
/// actually loops. Fresh context (no carried text) breaks most loops on its
/// own; VAD, which removed every loop in testing, is the last resort.
fn retry_ladder(vad_available: bool) -> Vec<WhisperPass> {
    let mut ladder = vec![
        WhisperPass { context: ContextMode::Carry, vad: false },
        WhisperPass { context: ContextMode::Fresh, vad: false },
    ];
    if vad_available {
        ladder.push(WhisperPass { context: ContextMode::Fresh, vad: true });
    }
    ladder
}

/// Run attempts until one is loop-free, keep the least-looped result, and
/// remove any repeats it still has. The first attempt's error is returned
/// (nothing to fall back to); later errors just end the ladder.
fn run_ladder(
    ladder: &[WhisperPass],
    mut attempt: impl FnMut(WhisperPass) -> Result<String, String>,
) -> Result<String, String> {
    let mut best: Option<(usize, String)> = None;

    for (i, &pass) in ladder.iter().enumerate() {
        let text = match attempt(pass) {
            Ok(text) => text,
            Err(e) if i == 0 => return Err(e),
            Err(e) => {
                log::warn!("Retry {:?} failed ({}); keeping the best attempt so far", pass, e);
                break;
            }
        };
        let looped = looped_word_count(&text);
        if looped > 0 {
            log::warn!("Repetition loop ({} words) with {:?}", looped, pass);
        }
        if best.as_ref().map_or(true, |(b, _)| looped < *b) {
            best = Some((looped, text));
        }
        if looped == 0 {
            break;
        }
    }

    let (_, text) = best.expect("ladder has at least one attempt");
    Ok(collapse_loops(&text))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn looped(n: usize) -> String {
        format!("start of the note. {}end of the note.", "I'm not going to be able to do that. ".repeat(n))
    }
    const CLEAN: &str = "start of the note. something real was said here. end of the note.";

    #[test]
    fn test_ladder_adds_vad_only_when_available() {
        assert_eq!(retry_ladder(false).len(), 2);
        let with_vad = retry_ladder(true);
        assert_eq!(with_vad.len(), 3);
        assert!(!with_vad[0].vad && with_vad[0].context == ContextMode::Carry);
        assert!(with_vad[2].vad);
    }

    #[test]
    fn test_clean_first_pass_runs_once() {
        let mut calls = 0;
        let out = run_ladder(&retry_ladder(true), |_| {
            calls += 1;
            Ok(CLEAN.to_string())
        });
        assert_eq!(out.unwrap(), CLEAN);
        assert_eq!(calls, 1);
    }

    #[test]
    fn test_loop_is_retried_until_clean() {
        let mut passes = Vec::new();
        let out = run_ladder(&retry_ladder(true), |pass| {
            passes.push(pass);
            Ok(if pass.vad { CLEAN.to_string() } else { looped(10) })
        });
        assert_eq!(out.unwrap(), CLEAN);
        assert_eq!(passes.len(), 3);
    }

    #[test]
    fn test_keeps_least_looped_attempt_and_collapses_it() {
        let mut n = 0;
        let out = run_ladder(&retry_ladder(false), |_| {
            n += 1;
            Ok(if n == 1 { looped(12) } else { looped(5) })
        })
        .unwrap();
        assert_eq!(looped_word_count(&out), 0);
        assert_eq!(out, "start of the note. I'm not going to be able to do that. end of the note.");
    }

    #[test]
    fn test_first_error_fails_but_retry_error_keeps_first_result() {
        assert!(run_ladder(&retry_ladder(false), |_| Err("boom".to_string())).is_err());

        let mut n = 0;
        let out = run_ladder(&retry_ladder(true), |_| {
            n += 1;
            if n == 1 { Ok(looped(10)) } else { Err("retry failed".to_string()) }
        });
        assert_eq!(looped_word_count(&out.unwrap()), 0);
        assert_eq!(n, 2);
    }

    #[test]
    fn test_unconfigured_engine_errors_instead_of_panicking() {
        let config = AppConfig::default();
        assert!(transcribe_file(Path::new("/a/chunk.wav"), &config).is_err());
    }
}

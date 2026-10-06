//! Which optional flags the installed `whisper-cli` understands. Older
//! whisper.cpp builds reject unknown flags and fail the whole transcription,
//! so options like VAD are only passed when the binary's `--help` lists them.
//! The answer is cached per binary path and modification time, so upgrading
//! whisper.cpp in place is picked up without a restart.

use crate::recording::utils::apply_no_console_window;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct WhisperCapabilities {
    /// `--vad` / `--vad-model` (whisper.cpp 1.7.6+).
    pub vad: bool,
    /// `--carry-initial-prompt` (whisper.cpp 1.8.1+).
    pub carry_initial_prompt: bool,
}

type CacheKey = (String, Option<SystemTime>);

fn cache() -> &'static Mutex<HashMap<CacheKey, WhisperCapabilities>> {
    static CACHE: OnceLock<Mutex<HashMap<CacheKey, WhisperCapabilities>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Capabilities of the whisper-cli at `whisper_path`. A binary that can't be
/// probed reports no optional capabilities, which reproduces the plain
/// invocation that works on every version.
pub fn whisper_capabilities(whisper_path: &str) -> WhisperCapabilities {
    let modified = std::fs::metadata(whisper_path).and_then(|m| m.modified()).ok();
    let key = (whisper_path.to_string(), modified);

    if let Some(caps) = cache().lock().ok().and_then(|c| c.get(&key).copied()) {
        return caps;
    }

    let caps = probe_help(whisper_path)
        .map(|help| parse_help(&help))
        .unwrap_or_default();
    log::info!("whisper-cli capabilities for {}: {:?}", whisper_path, caps);

    if let Ok(mut c) = cache().lock() {
        c.insert(key, caps);
    }
    caps
}

fn probe_help(whisper_path: &str) -> Option<String> {
    if !Path::new(whisper_path).exists() {
        return None;
    }
    let mut cmd = Command::new(whisper_path);
    cmd.arg("--help");
    apply_no_console_window(&mut cmd);
    let output = cmd.output().ok()?;
    // whisper-cli prints usage to stderr; read both to be safe.
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    Some(text)
}

/// Read capabilities from `whisper-cli --help` output.
pub fn parse_help(help: &str) -> WhisperCapabilities {
    WhisperCapabilities {
        vad: help.contains("--vad-model"),
        carry_initial_prompt: help.contains("--carry-initial-prompt"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HELP_1_7_5: &str = "\
  -mc N,     --max-context N     [-1     ] maximum number of text context tokens to store
             --prompt PROMPT     [       ] initial prompt (max n_text_ctx/2 tokens)
  -sns,      --suppress-nst      [false  ] suppress non-speech tokens";

    const HELP_1_9_5: &str = "\
             --prompt PROMPT        [       ] initial prompt (max n_text_ctx/2 tokens)
             --carry-initial-prompt [false  ] always prepend initial prompt
             --vad                           [false  ] enable Voice Activity Detection (VAD)
  -vm FNAME, --vad-model FNAME               [       ] VAD model path";

    #[test]
    fn test_old_whisper_has_no_optional_capabilities() {
        assert_eq!(parse_help(HELP_1_7_5), WhisperCapabilities::default());
    }

    #[test]
    fn test_current_whisper_supports_vad_and_carried_prompt() {
        let caps = parse_help(HELP_1_9_5);
        assert!(caps.vad);
        assert!(caps.carry_initial_prompt);
    }

    #[test]
    fn test_missing_binary_reports_no_capabilities() {
        assert_eq!(
            whisper_capabilities("/definitely/missing/whisper-cli"),
            WhisperCapabilities::default()
        );
    }
}

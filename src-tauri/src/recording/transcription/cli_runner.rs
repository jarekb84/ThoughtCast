//! Runs a transcription CLI that writes its result next to the input as
//! `<audio file>.txt` (whisper-cli and parakeet-cli both do with `-otxt`),
//! and returns the cleaned text. The output file is always removed.

use crate::recording::transcription::text_processor::clean_transcript;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Where an `-otxt` CLI writes the transcript for `audio_path`.
pub fn txt_output_path(audio_path: &Path) -> PathBuf {
    let mut name = OsString::from(audio_path.as_os_str());
    name.push(".txt");
    PathBuf::from(name)
}

/// Run `cmd` and read the transcript it wrote for `audio_path`.
/// `engine_name` is used in error messages ("Whisper", "Parakeet").
pub fn run_to_text(mut cmd: Command, audio_path: &Path, engine_name: &str) -> Result<String, String> {
    let output_path = txt_output_path(audio_path);
    // A stale file from a crashed run must not be mistaken for this run's output.
    let _ = fs::remove_file(&output_path);

    let output = cmd.output().map_err(|e| {
        format!(
            "{} couldn't start ({}). Check the path in Settings → Transcription.",
            engine_name, e
        )
    })?;

    if !output.status.success() {
        let _ = fs::remove_file(&output_path);
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "{} transcription failed: {}",
            engine_name,
            last_lines(&stderr, 8)
        ));
    }

    let raw = fs::read_to_string(&output_path).map_err(|e| {
        format!(
            "{} did not write a transcript at {} ({})",
            engine_name,
            output_path.display(),
            e
        )
    })?;
    let _ = fs::remove_file(&output_path);

    Ok(clean_transcript(&raw))
}

/// Model loading logs fill stderr; the reason for a failure is at the end.
fn last_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.trim().lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_txt_output_path_appends_extension() {
        let p = txt_output_path(Path::new("/tmp/.chunks-x/chunk_000.wav"));
        assert_eq!(p, PathBuf::from("/tmp/.chunks-x/chunk_000.wav.txt"));
    }

    #[test]
    fn test_last_lines_keeps_the_tail() {
        assert_eq!(last_lines("a\nb\nc\nd\n", 2), "c\nd");
        assert_eq!(last_lines("only", 5), "only");
    }

    #[test]
    fn test_missing_binary_reports_engine_name() {
        let cmd = Command::new("/definitely/missing/parakeet-cli");
        let err = run_to_text(cmd, Path::new("/tmp/none.wav"), "Parakeet").unwrap_err();
        assert!(err.starts_with("Parakeet couldn't start"), "got {}", err);
    }
}

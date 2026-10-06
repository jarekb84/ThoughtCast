//! NVIDIA Parakeet engine: runs whisper.cpp's `parakeet-cli` (whisper.cpp
//! 1.9+, built alongside whisper-cli) on one WAV file. Parakeet is a
//! transducer model, so it can't fall into Whisper's repetition loops, but it
//! takes no vocabulary prompt.

use crate::recording::models::AppConfig;
use crate::recording::transcription::cli_runner::run_to_text;
use crate::recording::utils::apply_no_console_window;
use std::path::Path;
use std::process::Command;

/// Transcribe one audio file with parakeet-cli.
pub fn transcribe(audio_path: &Path, config: &AppConfig) -> Result<String, String> {
    let t = &config.transcription;
    if t.parakeet_path.trim().is_empty() || !Path::new(&t.parakeet_path).exists() {
        return Err(
            "Parakeet is selected but parakeet-cli isn't set up. Set its path in Settings → Transcription (it ships with whisper.cpp 1.9+)."
                .to_string(),
        );
    }
    if t.parakeet_model_path.trim().is_empty() || !Path::new(&t.parakeet_model_path).exists() {
        return Err(
            "Parakeet model file is missing. Download ggml-parakeet-tdt-0.6b-v3 (see docs/SETUP_WHISPER.md)."
                .to_string(),
        );
    }

    let cmd = build_parakeet_command(&t.parakeet_path, &t.parakeet_model_path, audio_path);
    run_to_text(cmd, audio_path, "Parakeet")
}

fn build_parakeet_command(parakeet_path: &str, model_path: &str, audio_path: &Path) -> Command {
    let mut cmd = Command::new(parakeet_path);
    cmd.arg("-m")
        .arg(model_path)
        .arg("-f")
        .arg(audio_path)
        .arg("-otxt")
        .arg("--no-prints");
    apply_no_console_window(&mut cmd);
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_writes_txt_next_to_audio() {
        let cmd = build_parakeet_command("/bin/parakeet-cli", "/m/parakeet.bin", Path::new("/a/chunk.wav"));
        let args: Vec<String> = cmd.get_args().map(|s| s.to_string_lossy().to_string()).collect();
        assert_eq!(cmd.get_program().to_str().unwrap(), "/bin/parakeet-cli");
        assert_eq!(args, vec!["-m", "/m/parakeet.bin", "-f", "/a/chunk.wav", "-otxt", "--no-prints"]);
    }

    #[test]
    fn test_unconfigured_parakeet_explains_setup() {
        let config = AppConfig::default();
        let err = transcribe(Path::new("/a/chunk.wav"), &config).unwrap_err();
        assert!(err.contains("parakeet-cli"), "got {}", err);
    }
}

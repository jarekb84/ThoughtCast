//! Whisper.cpp engine: runs the external `whisper-cli` binary on one WAV file
//! and returns the cleaned transcript text.

use crate::recording::models::AppConfig;
use crate::recording::transcription::text_processor::clean_transcript;
use crate::recording::utils::apply_no_console_window;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::Duration;

/// Transcribe one audio file with whisper-cli. Removes Whisper's intermediate
/// `.txt` output; the caller owns any session-scoped persistence.
pub fn transcribe(audio_path: &Path, config: &AppConfig) -> Result<String, String> {
    validate_whisper_setup(config)?;

    let whisper_output_path = run_whisper_process(audio_path, config)?;

    let raw_transcript = fs::read_to_string(&whisper_output_path)
        .map_err(|e| format!("Failed to read transcript file: {}", e))?;

    let _ = fs::remove_file(whisper_output_path);

    Ok(clean_transcript(&raw_transcript))
}

/// Validate that Whisper.cpp and model files exist
fn validate_whisper_setup(config: &AppConfig) -> Result<(), String> {
    let whisper_path = Path::new(&config.whisper_path);
    if !whisper_path.exists() {
        return Err(
            "Whisper.cpp is not set up. Please see the README for setup instructions.".to_string(),
        );
    }

    let model_path = Path::new(&config.model_path);
    if !model_path.exists() {
        return Err(
            "Whisper model file is missing. Please download a model - see README.".to_string(),
        );
    }

    Ok(())
}

/// Build the whisper-cli `Command`. On Windows the `CREATE_NO_WINDOW` flag is
/// applied so the console popup never flashes during a recording.
fn build_whisper_command(whisper_path: &str, model_path: &str, audio_path: &Path) -> Command {
    let mut cmd = Command::new(whisper_path);
    cmd.arg("-m")
        .arg(model_path)
        .arg("-f")
        .arg(audio_path)
        .arg("-otxt");

    apply_no_console_window(&mut cmd);
    cmd
}

/// Execute Whisper.cpp process and return the output file path
fn run_whisper_process(audio_path: &Path, config: &AppConfig) -> Result<PathBuf, String> {
    // Run Whisper.cpp with -otxt flag to generate transcript file
    // Whisper will create a file named {audio_path}.txt
    let output = build_whisper_command(&config.whisper_path, &config.model_path, audio_path)
        .output()
        .map_err(|_| {
            "Transcription service couldn't start. Check your Whisper.cpp installation.".to_string()
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Whisper transcription failed: {}", stderr));
    }

    // Wait a moment for file to be written
    thread::sleep(Duration::from_millis(500));

    // Whisper creates the file at {audio_path}.txt
    let whisper_output_path = audio_path.with_extension("wav.txt");

    if !whisper_output_path.exists() {
        return Err(format!(
            "Whisper did not create transcript file at: {}",
            whisper_output_path.display()
        ));
    }

    Ok(whisper_output_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_whisper_command_contains_required_args() {
        let audio = PathBuf::from("/tmp/recording.wav");
        let cmd = build_whisper_command("/usr/bin/whisper", "/models/base.bin", &audio);

        let args: Vec<&str> = cmd
            .get_args()
            .map(|s| s.to_str().unwrap_or(""))
            .collect();

        assert!(args.contains(&"-m"), "missing -m flag, got args: {:?}", args);
        assert!(args.contains(&"-f"), "missing -f flag, got args: {:?}", args);
        assert!(args.contains(&"-otxt"), "missing -otxt flag, got args: {:?}", args);
    }

    #[test]
    fn test_build_whisper_command_uses_configured_paths() {
        let audio = PathBuf::from("/tmp/recording.wav");
        let cmd = build_whisper_command("/custom/whisper", "/custom/model.bin", &audio);

        // Program is the whisper binary path
        assert_eq!(
            cmd.get_program().to_str().unwrap(),
            "/custom/whisper"
        );

        // Model path appears as the value after -m, audio path after -f
        let args: Vec<String> = cmd
            .get_args()
            .map(|s| s.to_string_lossy().to_string())
            .collect();

        let m_idx = args.iter().position(|a| a == "-m").expect("no -m");
        assert_eq!(args[m_idx + 1], "/custom/model.bin");

        let f_idx = args.iter().position(|a| a == "-f").expect("no -f");
        assert_eq!(args[f_idx + 1], audio.to_string_lossy());
    }
}

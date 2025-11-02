use crate::recording::config::load_config;
use crate::recording::transcription::text_processor::{clean_transcript, save_transcript};
use std::fs;
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::Duration;

/// Transcribe audio using Whisper.cpp
///
/// Orchestrates the full transcription workflow:
/// 1. Load and validate Whisper configuration
/// 2. Execute Whisper.cpp subprocess
/// 3. Read raw transcript output
/// 4. Clean transcript text
/// 5. Save to storage
///
/// Returns (transcript_path, transcript_text)
pub fn transcribe_with_whisper(
    audio_path: &Path,
    session_id: &str,
) -> Result<(String, String), String> {
    // Load and validate config
    let config = load_config()?;
    validate_whisper_setup(&config)?;

    // Run Whisper.cpp to generate transcript
    let whisper_output_path = run_whisper_process(audio_path, &config)?;

    // Read raw transcript
    let raw_transcript = fs::read_to_string(&whisper_output_path)
        .map_err(|e| format!("Failed to read transcript file: {}", e))?;

    // Clean transcript
    let cleaned_transcript = clean_transcript(&raw_transcript);

    // Save to storage
    let transcript_path = save_transcript(session_id, &cleaned_transcript)?;

    // Delete temporary Whisper output file
    let _ = fs::remove_file(whisper_output_path);

    Ok((transcript_path, cleaned_transcript))
}

/// Validate that Whisper.cpp and model files exist
fn validate_whisper_setup(
    config: &crate::recording::models::WhisperConfig,
) -> Result<(), String> {
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

/// Execute Whisper.cpp process and return the output file path
///
/// On Windows, hides the console window to prevent popups
fn run_whisper_process(
    audio_path: &Path,
    config: &crate::recording::models::WhisperConfig,
) -> Result<std::path::PathBuf, String> {
    // Run Whisper.cpp with -otxt flag to generate transcript file
    // Whisper will create a file named {audio_path}.txt
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new(&config.whisper_path)
            .arg("-m")
            .arg(&config.model_path)
            .arg("-f")
            .arg(audio_path)
            .arg("-otxt")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|_| {
                "Transcription service couldn't start. Check your Whisper.cpp installation."
                    .to_string()
            })?
    };

    #[cfg(not(target_os = "windows"))]
    let output = Command::new(&config.whisper_path)
        .arg("-m")
        .arg(&config.model_path)
        .arg("-f")
        .arg(audio_path)
        .arg("-otxt")
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

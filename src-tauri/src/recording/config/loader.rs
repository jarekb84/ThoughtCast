use crate::recording::models::WhisperConfig;
use crate::recording::utils::get_storage_dir;
use std::fs;

/// Load the Whisper configuration from the config.json file
///
/// Returns an error with helpful setup instructions if the config file
/// doesn't exist or can't be parsed
pub fn load_config() -> Result<WhisperConfig, String> {
    let storage_dir = get_storage_dir()?;
    let config_file = storage_dir.join("config.json");

    if !config_file.exists() {
        return Err(format!(
            "Whisper.cpp is not set up. Please create config.json at: {}\n\
            See README for setup instructions.\n\
            Example content:\n\
            {{\n\
              \"whisperPath\": \"C:\\\\whisper\\\\whisper.exe\",\n\
              \"modelPath\": \"C:\\\\whisper\\\\models\\\\ggml-base.bin\"\n\
            }}",
            config_file.display()
        ));
    }

    let content = fs::read_to_string(&config_file)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config file: {}", e))
}

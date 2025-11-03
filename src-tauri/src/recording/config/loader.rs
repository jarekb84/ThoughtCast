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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_config() {
        let json = r#"{
            "whisperPath": "/usr/local/bin/whisper-cli",
            "modelPath": "/models/ggml-base.bin"
        }"#;

        let config: Result<WhisperConfig, _> = serde_json::from_str(json);
        assert!(config.is_ok());

        let config = config.unwrap();
        assert_eq!(config.whisper_path, "/usr/local/bin/whisper-cli");
        assert_eq!(config.model_path, "/models/ggml-base.bin");
        assert_eq!(config.voice_notes_dir, None);
    }

    #[test]
    fn test_parse_config_with_voice_notes_dir() {
        let json = r#"{
            "whisperPath": "/usr/local/bin/whisper-cli",
            "modelPath": "/models/ggml-base.bin",
            "voiceNotesDir": "/custom/notes"
        }"#;

        let config: Result<WhisperConfig, _> = serde_json::from_str(json);
        assert!(config.is_ok());

        let config = config.unwrap();
        assert_eq!(config.voice_notes_dir, Some("/custom/notes".to_string()));
    }

    #[test]
    fn test_parse_invalid_json() {
        let json = r#"{
            "whisperPath": "/usr/local/bin/whisper-cli"
            "modelPath": "/models/ggml-base.bin"
        }"#;

        let config: Result<WhisperConfig, _> = serde_json::from_str(json);
        assert!(config.is_err());
    }

    #[test]
    fn test_parse_missing_required_fields() {
        let json = r#"{
            "whisperPath": "/usr/local/bin/whisper-cli"
        }"#;

        let config: Result<WhisperConfig, _> = serde_json::from_str(json);
        assert!(config.is_err());
    }

    #[test]
    fn test_parse_windows_paths() {
        let json = r#"{
            "whisperPath": "C:\\whisper\\whisper.exe",
            "modelPath": "C:\\whisper\\models\\ggml-base.bin"
        }"#;

        let config: Result<WhisperConfig, _> = serde_json::from_str(json);
        assert!(config.is_ok());

        let config = config.unwrap();
        assert_eq!(config.whisper_path, "C:\\whisper\\whisper.exe");
        assert_eq!(config.model_path, "C:\\whisper\\models\\ggml-base.bin");
    }

    #[test]
    fn test_parse_extra_fields_ignored() {
        let json = r#"{
            "whisperPath": "/usr/local/bin/whisper-cli",
            "modelPath": "/models/ggml-base.bin",
            "extraField": "should be ignored"
        }"#;

        let config: Result<WhisperConfig, _> = serde_json::from_str(json);
        assert!(config.is_ok());
    }
}

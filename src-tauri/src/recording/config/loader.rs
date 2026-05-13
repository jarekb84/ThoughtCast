use crate::recording::models::AppConfig;
use crate::recording::utils::get_storage_dir;
use std::fs;

/// Load the application configuration from `config.json`.
///
/// Returns `AppConfig::default()` if the file does not exist yet (fresh install
/// or pre-Settings-panel migration). Older configs with only whisperPath/modelPath
/// keep working — newly added fields fall back to defaults.
pub fn load_config() -> Result<AppConfig, String> {
    let storage_dir = get_storage_dir()?;
    let config_file = storage_dir.join("config.json");

    if !config_file.exists() {
        return Ok(AppConfig::default());
    }

    let content = fs::read_to_string(&config_file)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config file: {}", e))
}

#[cfg(test)]
mod tests {
    use crate::recording::models::AppConfig;

    #[test]
    fn test_parse_valid_config() {
        let json = r#"{
            "whisperPath": "/usr/local/bin/whisper-cli",
            "modelPath": "/models/ggml-base.bin"
        }"#;

        let config: AppConfig = serde_json::from_str(json).expect("should parse");
        assert_eq!(config.whisper_path, "/usr/local/bin/whisper-cli");
        assert_eq!(config.model_path, "/models/ggml-base.bin");
        assert_eq!(config.voice_notes_dir, None);
        assert_eq!(config.ffmpeg_path, "");
    }

    #[test]
    fn test_parse_config_with_voice_notes_dir() {
        let json = r#"{
            "whisperPath": "/usr/local/bin/whisper-cli",
            "modelPath": "/models/ggml-base.bin",
            "voiceNotesDir": "/custom/notes"
        }"#;

        let config: AppConfig = serde_json::from_str(json).expect("should parse");
        assert_eq!(config.voice_notes_dir, Some("/custom/notes".to_string()));
    }

    #[test]
    fn test_parse_invalid_json() {
        let json = r#"{
            "whisperPath": "/usr/local/bin/whisper-cli"
            "modelPath": "/models/ggml-base.bin"
        }"#;

        let result: Result<AppConfig, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_partial_config_uses_defaults() {
        // Missing required-looking fields default to empty strings now —
        // validation happens at the call site (Settings panel), not at load time.
        let json = r#"{
            "whisperPath": "/usr/local/bin/whisper-cli"
        }"#;

        let config: AppConfig = serde_json::from_str(json).expect("should parse");
        assert_eq!(config.whisper_path, "/usr/local/bin/whisper-cli");
        assert_eq!(config.model_path, "");
    }

    #[test]
    fn test_parse_windows_paths() {
        let json = r#"{
            "whisperPath": "C:\\whisper\\whisper.exe",
            "modelPath": "C:\\whisper\\models\\ggml-base.bin"
        }"#;

        let config: AppConfig = serde_json::from_str(json).expect("should parse");
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

        let result: Result<AppConfig, _> = serde_json::from_str(json);
        assert!(result.is_ok());
    }
}

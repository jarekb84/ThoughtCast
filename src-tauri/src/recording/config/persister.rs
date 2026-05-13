use crate::recording::models::AppConfig;
use crate::recording::utils::get_storage_dir;
use std::fs;

/// Persist application configuration to `config.json` atomically.
///
/// Writes to `config.json.tmp` first then renames over the real file so a crash
/// mid-write can never leave the user with a half-written config (we'd rather
/// keep the old config than corrupt it).
pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let storage_dir = get_storage_dir()?;
    let final_path = storage_dir.join("config.json");
    let temp_path = storage_dir.join("config.json.tmp");

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&temp_path, content)
        .map_err(|e| format!("Failed to write config temp file: {}", e))?;

    fs::rename(&temp_path, &final_path)
        .map_err(|e| format!("Failed to finalize config file: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recording::models::AudioCompressionConfig;

    #[test]
    fn test_serialize_pretty_round_trip() {
        let config = AppConfig {
            whisper_path: "/bin/whisper".into(),
            model_path: "/models/base.bin".into(),
            voice_notes_dir: None,
            ffmpeg_path: "/bin/ffmpeg".into(),
            audio_compression: AudioCompressionConfig {
                compress_new_recordings: true,
                compress_old_recordings_enabled: false,
                compress_old_recordings_older_than_days: 14,
            },
        };

        let json = serde_json::to_string_pretty(&config).unwrap();
        // The pretty form should have newlines and the camelCase field names.
        assert!(json.contains("\n"));
        assert!(json.contains("\"whisperPath\""));
        assert!(json.contains("\"ffmpegPath\""));
        assert!(json.contains("\"compressNewRecordings\": true"));

        let parsed: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.whisper_path, "/bin/whisper");
        assert_eq!(parsed.ffmpeg_path, "/bin/ffmpeg");
        assert!(parsed.audio_compression.compress_new_recordings);
        assert_eq!(
            parsed.audio_compression.compress_old_recordings_older_than_days,
            14
        );
    }

    #[test]
    fn test_voice_notes_dir_omitted_when_none() {
        let config = AppConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        assert!(!json.contains("voiceNotesDir"));
    }
}

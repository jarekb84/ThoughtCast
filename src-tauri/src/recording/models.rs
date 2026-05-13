use serde::{Deserialize, Serialize};

/// Represents a single recording session with its metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub timestamp: String,
    pub audio_path: String,
    pub duration: f64,
    pub preview: String,
    #[serde(default)]
    pub transcript_path: String,
    #[serde(default)]
    pub clipboard_copied: bool,
    /// Time taken to transcribe in seconds (for progress estimation)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcription_time_seconds: Option<f64>,
    /// Model used for transcription (for filtering estimates by model)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_path: Option<String>,
}

/// Index containing all recording sessions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionIndex {
    pub sessions: Vec<Session>,
}

/// Audio compression behavior settings, persisted under `audioCompression` in config.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioCompressionConfig {
    #[serde(rename = "compressNewRecordings", default = "default_compress_new_recordings")]
    pub compress_new_recordings: bool,
    #[serde(rename = "compressOldRecordingsEnabled", default)]
    pub compress_old_recordings_enabled: bool,
    #[serde(
        rename = "compressOldRecordingsOlderThanDays",
        default = "default_compress_threshold_days"
    )]
    pub compress_old_recordings_older_than_days: u32,
}

fn default_compress_new_recordings() -> bool {
    true
}

fn default_compress_threshold_days() -> u32 {
    7
}

impl Default for AudioCompressionConfig {
    fn default() -> Self {
        Self {
            compress_new_recordings: default_compress_new_recordings(),
            compress_old_recordings_enabled: false,
            compress_old_recordings_older_than_days: default_compress_threshold_days(),
        }
    }
}

/// Persisted application configuration
///
/// Loaded from / saved to `~/Documents/ThoughtCast/config.json`. New fields
/// (ffmpegPath, audioCompression) default sensibly so older config files keep
/// working without manual migration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(rename = "whisperPath", default)]
    pub whisper_path: String,
    #[serde(rename = "modelPath", default)]
    pub model_path: String,
    #[serde(rename = "voiceNotesDir", skip_serializing_if = "Option::is_none")]
    pub voice_notes_dir: Option<String>,
    #[serde(rename = "ffmpegPath", default)]
    pub ffmpeg_path: String,
    #[serde(rename = "audioCompression", default)]
    pub audio_compression: AudioCompressionConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            whisper_path: String::new(),
            model_path: String::new(),
            voice_notes_dir: None,
            ffmpeg_path: String::new(),
            audio_compression: AudioCompressionConfig::default(),
        }
    }
}

/// Backwards-compatible alias for code that still references the old type name.
/// Prefer `AppConfig` in new code.
pub type WhisperConfig = AppConfig;

/// Event payload for transcription completion
#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionCompleteEvent {
    pub session: Session,
}

/// Event payload for transcription errors
#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionErrorEvent {
    pub session_id: String,
    pub error: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_serialization() {
        let session = Session {
            id: "2024-11-02_15-30-00".to_string(),
            timestamp: "2024-11-02T15:30:00Z".to_string(),
            audio_path: "audio/2024-11-02_15-30-00.wav".to_string(),
            duration: 45.5,
            preview: "This is a test preview".to_string(),
            transcript_path: "text/2024-11-02_15-30-00.txt".to_string(),
            clipboard_copied: true,
            transcription_time_seconds: Some(6.8),
            model_path: Some("/path/to/model.bin".to_string()),
        };

        let json = serde_json::to_string(&session).unwrap();
        let deserialized: Session = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, session.id);
        assert_eq!(deserialized.timestamp, session.timestamp);
        assert_eq!(deserialized.audio_path, session.audio_path);
        assert_eq!(deserialized.duration, session.duration);
        assert_eq!(deserialized.preview, session.preview);
        assert_eq!(deserialized.transcript_path, session.transcript_path);
        assert_eq!(deserialized.clipboard_copied, session.clipboard_copied);
        assert_eq!(deserialized.transcription_time_seconds, Some(6.8));
        assert_eq!(
            deserialized.model_path,
            Some("/path/to/model.bin".to_string())
        );
    }

    #[test]
    fn test_session_default_fields() {
        let json = r#"{
            "id": "test-id",
            "timestamp": "2024-11-02T15:30:00Z",
            "audio_path": "audio/test.wav",
            "duration": 10.0,
            "preview": "Test preview"
        }"#;

        let session: Session = serde_json::from_str(json).unwrap();

        assert_eq!(session.transcript_path, "");
        assert_eq!(session.clipboard_copied, false);
        assert_eq!(session.transcription_time_seconds, None);
        assert_eq!(session.model_path, None);
    }

    #[test]
    fn test_session_index_serialization() {
        let sessions = vec![
            Session {
                id: "session1".to_string(),
                timestamp: "2024-11-02T15:30:00Z".to_string(),
                audio_path: "audio/session1.wav".to_string(),
                duration: 30.0,
                preview: "First session".to_string(),
                transcript_path: "text/session1.txt".to_string(),
                clipboard_copied: true,
                transcription_time_seconds: Some(4.5),
                model_path: Some("/model.bin".to_string()),
            },
            Session {
                id: "session2".to_string(),
                timestamp: "2024-11-02T16:00:00Z".to_string(),
                audio_path: "audio/session2.wav".to_string(),
                duration: 45.0,
                preview: "Second session".to_string(),
                transcript_path: "text/session2.txt".to_string(),
                clipboard_copied: false,
                transcription_time_seconds: None,
                model_path: None,
            },
        ];

        let index = SessionIndex {
            sessions: sessions.clone(),
        };

        let json = serde_json::to_string(&index).unwrap();
        let deserialized: SessionIndex = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.sessions.len(), 2);
        assert_eq!(deserialized.sessions[0].id, "session1");
        assert_eq!(deserialized.sessions[1].id, "session2");
    }

    #[test]
    fn test_app_config_full_serialization_round_trip() {
        let config = AppConfig {
            whisper_path: "/path/to/whisper".to_string(),
            model_path: "/path/to/model.bin".to_string(),
            voice_notes_dir: Some("/path/to/notes".to_string()),
            ffmpeg_path: "/usr/local/bin/ffmpeg".to_string(),
            audio_compression: AudioCompressionConfig {
                compress_new_recordings: true,
                compress_old_recordings_enabled: true,
                compress_old_recordings_older_than_days: 30,
            },
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: AppConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.whisper_path, config.whisper_path);
        assert_eq!(deserialized.model_path, config.model_path);
        assert_eq!(deserialized.voice_notes_dir, config.voice_notes_dir);
        assert_eq!(deserialized.ffmpeg_path, config.ffmpeg_path);
        assert!(deserialized.audio_compression.compress_new_recordings);
        assert!(deserialized.audio_compression.compress_old_recordings_enabled);
        assert_eq!(
            deserialized
                .audio_compression
                .compress_old_recordings_older_than_days,
            30
        );
    }

    #[test]
    fn test_app_config_camel_case_fields() {
        let json = r#"{
            "whisperPath": "/usr/bin/whisper",
            "modelPath": "/models/base.bin",
            "voiceNotesDir": "/notes",
            "ffmpegPath": "/bin/ffmpeg",
            "audioCompression": {
                "compressNewRecordings": true,
                "compressOldRecordingsEnabled": false,
                "compressOldRecordingsOlderThanDays": 14
            }
        }"#;

        let config: AppConfig = serde_json::from_str(json).unwrap();

        assert_eq!(config.whisper_path, "/usr/bin/whisper");
        assert_eq!(config.model_path, "/models/base.bin");
        assert_eq!(config.voice_notes_dir, Some("/notes".to_string()));
        assert_eq!(config.ffmpeg_path, "/bin/ffmpeg");
        assert!(config.audio_compression.compress_new_recordings);
        assert!(!config.audio_compression.compress_old_recordings_enabled);
        assert_eq!(
            config
                .audio_compression
                .compress_old_recordings_older_than_days,
            14
        );
    }

    #[test]
    fn test_legacy_two_field_config_still_loads() {
        // Older config.json files only had whisperPath + modelPath.
        // Must still deserialize, with default ffmpeg + compression sections.
        let json = r#"{
            "whisperPath": "/usr/bin/whisper",
            "modelPath": "/models/base.bin"
        }"#;

        let config: AppConfig = serde_json::from_str(json).unwrap();

        assert_eq!(config.whisper_path, "/usr/bin/whisper");
        assert_eq!(config.model_path, "/models/base.bin");
        assert_eq!(config.voice_notes_dir, None);
        assert_eq!(config.ffmpeg_path, "");
        // compress_new_recordings defaults to true so legacy configs adopt the
        // post-transcription compression behavior automatically.
        assert!(config.audio_compression.compress_new_recordings);
        assert!(!config.audio_compression.compress_old_recordings_enabled);
        assert_eq!(
            config
                .audio_compression
                .compress_old_recordings_older_than_days,
            7
        );
    }

    #[test]
    fn test_app_config_defaults() {
        let config = AppConfig::default();
        assert_eq!(config.whisper_path, "");
        assert_eq!(config.model_path, "");
        assert_eq!(config.ffmpeg_path, "");
        assert!(config.audio_compression.compress_new_recordings);
        assert_eq!(
            config
                .audio_compression
                .compress_old_recordings_older_than_days,
            7
        );
    }
}

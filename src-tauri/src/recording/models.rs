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

/// Configuration for Whisper.cpp integration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperConfig {
    #[serde(rename = "whisperPath")]
    pub whisper_path: String,
    #[serde(rename = "modelPath")]
    pub model_path: String,
    #[serde(rename = "voiceNotesDir")]
    pub voice_notes_dir: Option<String>,
}

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
    fn test_whisper_config_serialization() {
        let config = WhisperConfig {
            whisper_path: "/path/to/whisper".to_string(),
            model_path: "/path/to/model.bin".to_string(),
            voice_notes_dir: Some("/path/to/notes".to_string()),
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: WhisperConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.whisper_path, config.whisper_path);
        assert_eq!(deserialized.model_path, config.model_path);
        assert_eq!(deserialized.voice_notes_dir, config.voice_notes_dir);
    }

    #[test]
    fn test_whisper_config_camel_case_fields() {
        // Test that JSON uses camelCase as expected by frontend
        let json = r#"{
            "whisperPath": "/usr/bin/whisper",
            "modelPath": "/models/base.bin",
            "voiceNotesDir": "/notes"
        }"#;

        let config: WhisperConfig = serde_json::from_str(json).unwrap();

        assert_eq!(config.whisper_path, "/usr/bin/whisper");
        assert_eq!(config.model_path, "/models/base.bin");
        assert_eq!(config.voice_notes_dir, Some("/notes".to_string()));
    }

    #[test]
    fn test_whisper_config_optional_voice_notes_dir() {
        let json = r#"{
            "whisperPath": "/usr/bin/whisper",
            "modelPath": "/models/base.bin"
        }"#;

        let config: WhisperConfig = serde_json::from_str(json).unwrap();

        assert_eq!(config.whisper_path, "/usr/bin/whisper");
        assert_eq!(config.model_path, "/models/base.bin");
        assert_eq!(config.voice_notes_dir, None);
    }
}

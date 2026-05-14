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

/// How a press of the record shortcut behaves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TriggerMode {
    /// Press once to start, press again to stop.
    Toggle,
    /// Hold to record, release to stop.
    PushToTalk,
}

impl Default for TriggerMode {
    fn default() -> Self {
        TriggerMode::Toggle
    }
}

/// Global keyboard shortcut configuration, persisted under `keyboardShortcuts` in config.json.
///
/// Both shortcuts are Tauri-global-shortcut accelerator strings (e.g. `"F1"`,
/// `"CommandOrControl+Shift+R"`), parsed by `Shortcut::from_str`. The cancel
/// shortcut is only registered while a recording is active, so the default
/// `"Escape"` does not interfere with text inputs on the OS when idle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyboardShortcutsConfig {
    #[serde(rename = "recordShortcut", default = "default_record_shortcut")]
    pub record_shortcut: String,
    #[serde(rename = "cancelShortcut", default = "default_cancel_shortcut")]
    pub cancel_shortcut: String,
    #[serde(rename = "triggerMode", default)]
    pub trigger_mode: TriggerMode,
}

fn default_record_shortcut() -> String {
    "F1".to_string()
}

fn default_cancel_shortcut() -> String {
    "Escape".to_string()
}

impl Default for KeyboardShortcutsConfig {
    fn default() -> Self {
        Self {
            record_shortcut: default_record_shortcut(),
            cancel_shortcut: default_cancel_shortcut(),
            trigger_mode: TriggerMode::default(),
        }
    }
}

/// Audio feedback (cue) configuration, persisted under `audioFeedback` in config.json.
///
/// Empty `*_cue_path` strings mean "use the bundled default at
/// `<documents>/ThoughtCast/sounds/<cue>.wav`" — resolved at playback time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioFeedbackConfig {
    #[serde(rename = "enabled", default = "default_audio_feedback_enabled")]
    pub enabled: bool,
    #[serde(rename = "volume", default = "default_audio_feedback_volume")]
    pub volume: f32,
    #[serde(rename = "startCuePath", default)]
    pub start_cue_path: String,
    #[serde(rename = "stopCuePath", default)]
    pub stop_cue_path: String,
    #[serde(rename = "readyCuePath", default)]
    pub ready_cue_path: String,
}

fn default_audio_feedback_enabled() -> bool {
    true
}

fn default_audio_feedback_volume() -> f32 {
    0.7
}

impl Default for AudioFeedbackConfig {
    fn default() -> Self {
        Self {
            enabled: default_audio_feedback_enabled(),
            volume: default_audio_feedback_volume(),
            start_cue_path: String::new(),
            stop_cue_path: String::new(),
            ready_cue_path: String::new(),
        }
    }
}

/// Persisted application configuration
///
/// Loaded from / saved to `~/Documents/ThoughtCast/config.json`. New fields
/// default sensibly so older config files keep working without manual migration.
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
    #[serde(rename = "keyboardShortcuts", default)]
    pub keyboard_shortcuts: KeyboardShortcutsConfig,
    #[serde(rename = "audioFeedback", default)]
    pub audio_feedback: AudioFeedbackConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            whisper_path: String::new(),
            model_path: String::new(),
            voice_notes_dir: None,
            ffmpeg_path: String::new(),
            audio_compression: AudioCompressionConfig::default(),
            keyboard_shortcuts: KeyboardShortcutsConfig::default(),
            audio_feedback: AudioFeedbackConfig::default(),
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
            ..AppConfig::default()
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
        assert_eq!(config.keyboard_shortcuts.record_shortcut, "F1");
        assert_eq!(config.keyboard_shortcuts.cancel_shortcut, "Escape");
        assert_eq!(config.keyboard_shortcuts.trigger_mode, TriggerMode::Toggle);
        assert!(config.audio_feedback.enabled);
        assert!((config.audio_feedback.volume - 0.7).abs() < f32::EPSILON);
    }

    #[test]
    fn test_keyboard_shortcuts_and_audio_feedback_round_trip() {
        let config = AppConfig {
            keyboard_shortcuts: KeyboardShortcutsConfig {
                record_shortcut: "CommandOrControl+Shift+R".to_string(),
                cancel_shortcut: "Alt+X".to_string(),
                trigger_mode: TriggerMode::PushToTalk,
            },
            audio_feedback: AudioFeedbackConfig {
                enabled: false,
                volume: 0.25,
                start_cue_path: "/custom/start.wav".to_string(),
                stop_cue_path: String::new(),
                ready_cue_path: "/custom/ready.ogg".to_string(),
            },
            ..AppConfig::default()
        };

        let json = serde_json::to_string(&config).unwrap();
        let parsed: AppConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(
            parsed.keyboard_shortcuts.record_shortcut,
            "CommandOrControl+Shift+R"
        );
        assert_eq!(parsed.keyboard_shortcuts.cancel_shortcut, "Alt+X");
        assert_eq!(
            parsed.keyboard_shortcuts.trigger_mode,
            TriggerMode::PushToTalk
        );
        assert!(!parsed.audio_feedback.enabled);
        assert!((parsed.audio_feedback.volume - 0.25).abs() < f32::EPSILON);
        assert_eq!(parsed.audio_feedback.start_cue_path, "/custom/start.wav");
        assert_eq!(parsed.audio_feedback.stop_cue_path, "");
    }

    #[test]
    fn test_trigger_mode_serialization_uses_kebab_case() {
        let toggle_json = serde_json::to_string(&TriggerMode::Toggle).unwrap();
        let ptt_json = serde_json::to_string(&TriggerMode::PushToTalk).unwrap();
        assert_eq!(toggle_json, "\"toggle\"");
        assert_eq!(ptt_json, "\"push-to-talk\"");
    }
}

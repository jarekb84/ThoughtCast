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

use crate::recording::models::{Session, SessionIndex};
use crate::recording::utils::get_storage_dir;
use std::fs;

/// Load all sessions from the sessions.json index file
///
/// Creates an empty index file if it doesn't exist
pub fn load_sessions() -> Result<SessionIndex, String> {
    let storage_dir = get_storage_dir()?;
    let sessions_file = storage_dir.join("sessions.json");

    if !sessions_file.exists() {
        // Create empty sessions file
        let index = SessionIndex {
            sessions: Vec::new(),
        };
        save_sessions(&index)?;
        return Ok(index);
    }

    let content = fs::read_to_string(&sessions_file)
        .map_err(|e| format!("Failed to read sessions file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse sessions file: {}", e))
}

/// Save the session index to disk
///
/// Writes to sessions.json with pretty-printing for human readability
pub fn save_sessions(index: &SessionIndex) -> Result<(), String> {
    let storage_dir = get_storage_dir()?;
    let sessions_file = storage_dir.join("sessions.json");

    let content = serde_json::to_string_pretty(index)
        .map_err(|e| format!("Failed to serialize sessions: {}", e))?;

    fs::write(&sessions_file, content)
        .map_err(|e| format!("Failed to write sessions file: {}", e))
}

/// Load transcript text for a specific session from disk
pub fn load_transcript(session_id: &str) -> Result<String, String> {
    let storage_dir = get_storage_dir()?;
    let transcript_path = storage_dir
        .join("text")
        .join(format!("{}.txt", session_id));

    if !transcript_path.exists() {
        return Err(format!(
            "Transcript file not found: {}",
            transcript_path.display()
        ));
    }

    fs::read_to_string(&transcript_path)
        .map_err(|e| format!("Failed to read transcript file: {}", e))
}

/// Add a new session to the index
///
/// Inserts at the beginning so most recent sessions appear first
pub fn add_session(session: Session) -> Result<(), String> {
    let mut index = load_sessions()?;
    index.sessions.insert(0, session);
    save_sessions(&index)
}

/// Update an existing session in the index
#[allow(dead_code)]
pub fn update_session<F>(session_id: &str, updater: F) -> Result<(), String>
where
    F: FnOnce(&mut Session),
{
    let mut index = load_sessions()?;

    let session = index
        .sessions
        .iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    updater(session);

    save_sessions(&index)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_session(id: &str, duration: f64) -> Session {
        Session {
            id: id.to_string(),
            timestamp: "2024-11-02T15:30:00Z".to_string(),
            audio_path: format!("audio/{}.wav", id),
            duration,
            preview: format!("Preview for {}", id),
            transcript_path: format!("text/{}.txt", id),
            clipboard_copied: false,
            transcription_time_seconds: None,
            model_path: None,
        }
    }

    #[test]
    fn test_session_index_serialization() {
        let sessions = vec![
            create_test_session("session1", 30.0),
            create_test_session("session2", 45.0),
        ];

        let index = SessionIndex {
            sessions: sessions.clone(),
        };

        let json = serde_json::to_string_pretty(&index).unwrap();
        let deserialized: SessionIndex = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.sessions.len(), 2);
        assert_eq!(deserialized.sessions[0].id, "session1");
        assert_eq!(deserialized.sessions[1].id, "session2");
    }

    #[test]
    fn test_empty_session_index() {
        let index = SessionIndex {
            sessions: Vec::new(),
        };

        let json = serde_json::to_string_pretty(&index).unwrap();
        let deserialized: SessionIndex = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.sessions.len(), 0);
    }

    #[test]
    fn test_session_ordering_insert_at_beginning() {
        let mut sessions = vec![
            create_test_session("old-session", 30.0),
        ];

        let new_session = create_test_session("new-session", 45.0);
        sessions.insert(0, new_session);

        assert_eq!(sessions[0].id, "new-session");
        assert_eq!(sessions[1].id, "old-session");
    }

    #[test]
    fn test_update_session_finder() {
        let mut sessions = vec![
            create_test_session("session1", 30.0),
            create_test_session("session2", 45.0),
            create_test_session("session3", 60.0),
        ];

        let session = sessions
            .iter_mut()
            .find(|s| s.id == "session2")
            .unwrap();

        session.clipboard_copied = true;
        session.preview = "Updated preview".to_string();

        assert_eq!(sessions[1].clipboard_copied, true);
        assert_eq!(sessions[1].preview, "Updated preview");
    }

    #[test]
    fn test_session_not_found() {
        let sessions = vec![
            create_test_session("session1", 30.0),
        ];

        let result = sessions.iter().find(|s| s.id == "nonexistent");
        assert!(result.is_none());
    }

    #[test]
    fn test_session_index_round_trip() {
        let original = SessionIndex {
            sessions: vec![
                create_test_session("test1", 10.5),
                create_test_session("test2", 20.3),
            ],
        };

        // Serialize
        let json = serde_json::to_string(&original).unwrap();

        // Deserialize
        let deserialized: SessionIndex = serde_json::from_str(&json).unwrap();

        // Verify all fields
        assert_eq!(deserialized.sessions.len(), 2);
        assert_eq!(deserialized.sessions[0].id, "test1");
        assert_eq!(deserialized.sessions[0].duration, 10.5);
        assert_eq!(deserialized.sessions[1].id, "test2");
        assert_eq!(deserialized.sessions[1].duration, 20.3);
    }

    #[test]
    fn test_session_with_all_fields() {
        let session = Session {
            id: "full-session".to_string(),
            timestamp: "2024-11-02T15:30:00Z".to_string(),
            audio_path: "audio/full-session.wav".to_string(),
            duration: 123.45,
            preview: "Complete preview text".to_string(),
            transcript_path: "text/full-session.txt".to_string(),
            clipboard_copied: true,
            transcription_time_seconds: Some(18.5),
            model_path: Some("/path/to/model.bin".to_string()),
        };

        let json = serde_json::to_string(&session).unwrap();
        let deserialized: Session = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, "full-session");
        assert_eq!(deserialized.timestamp, "2024-11-02T15:30:00Z");
        assert_eq!(deserialized.audio_path, "audio/full-session.wav");
        assert_eq!(deserialized.duration, 123.45);
        assert_eq!(deserialized.preview, "Complete preview text");
        assert_eq!(deserialized.transcript_path, "text/full-session.txt");
        assert_eq!(deserialized.clipboard_copied, true);
    }
}

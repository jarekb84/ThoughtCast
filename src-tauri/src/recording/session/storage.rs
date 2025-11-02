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

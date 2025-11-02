use std::fs;
use std::path::PathBuf;

/// Get the main storage directory for ThoughtCast recordings
/// Creates the directory structure if it doesn't exist
///
/// Uses Documents/ThoughtCast/ to follow voice memo app patterns
/// and make recordings easily accessible to users
pub fn get_storage_dir() -> Result<PathBuf, String> {
    let documents_dir = dirs::document_dir()
        .ok_or("Could not find documents directory")?;

    let storage_dir = documents_dir.join("ThoughtCast");

    // Create directories if they don't exist
    fs::create_dir_all(&storage_dir)
        .map_err(|e| format!("Failed to create storage directory: {}", e))?;

    fs::create_dir_all(storage_dir.join("audio"))
        .map_err(|e| format!("Failed to create audio directory: {}", e))?;

    fs::create_dir_all(storage_dir.join("text"))
        .map_err(|e| format!("Failed to create text directory: {}", e))?;

    Ok(storage_dir)
}

use crate::recording::utils::get_storage_dir;
use std::fs;

/// Clean raw Whisper transcript output
///
/// Removes timestamp lines like [00:00:00.000 --> 00:00:02.000]
/// and returns clean text
pub fn clean_transcript(raw_transcript: &str) -> String {
    raw_transcript
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            // Filter out timestamp lines
            !trimmed.starts_with('[') || !trimmed.contains("-->")
        })
        .collect::<Vec<&str>>()
        .join("\n")
        .trim()
        .to_string()
}

/// Save cleaned transcript to the text directory
///
/// Returns the relative path to the saved transcript file
pub fn save_transcript(session_id: &str, transcript_text: &str) -> Result<String, String> {
    let storage_dir = get_storage_dir()?;
    let transcript_filename = format!("{}.txt", session_id);
    let transcript_path = storage_dir.join("text").join(&transcript_filename);

    fs::write(&transcript_path, transcript_text)
        .map_err(|e| format!("Failed to write cleaned transcript: {}", e))?;

    Ok(format!("text/{}", transcript_filename))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_transcript_removes_timestamps() {
        let raw = "[00:00:00.000 --> 00:00:02.000]\nHello world\n[00:00:02.000 --> 00:00:04.000]\nThis is a test";
        let cleaned = clean_transcript(raw);
        assert_eq!(cleaned, "Hello world\nThis is a test");
    }

    #[test]
    fn test_clean_transcript_preserves_text() {
        let raw = "Hello world\nThis is a test";
        let cleaned = clean_transcript(raw);
        assert_eq!(cleaned, "Hello world\nThis is a test");
    }

    #[test]
    fn test_clean_transcript_handles_empty() {
        let raw = "";
        let cleaned = clean_transcript(raw);
        assert_eq!(cleaned, "");
    }
}

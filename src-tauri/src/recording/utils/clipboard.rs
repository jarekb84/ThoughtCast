use arboard::Clipboard;

/// Copy text to the system clipboard
///
/// This provides a simple wrapper around the arboard clipboard functionality,
/// making it easy to mock for testing and isolating the system dependency
pub fn copy_to_clipboard(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;

    clipboard
        .set_text(text)
        .map_err(|e| format!("Failed to copy to clipboard: {}", e))?;

    Ok(())
}

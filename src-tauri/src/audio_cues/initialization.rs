use super::path_resolver::{default_cue_path, CueType};
use crate::recording::get_storage_dir;
use std::fs;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

/// First-launch setup: ensures `<documents>/ThoughtCast/sounds/` exists and
/// copies the three bundled default WAVs into it if they are missing.
///
/// Idempotent — safe to call on every startup. Files that already exist (even
/// if user-edited) are not overwritten, so a user who replaced their copy of
/// `start.wav` keeps their replacement.
pub fn initialize_default_cues(app: &AppHandle) -> Result<(), String> {
    let storage_dir = get_storage_dir()?;
    let sounds_dir = storage_dir.join("sounds");
    fs::create_dir_all(&sounds_dir)
        .map_err(|e| format!("Failed to create sounds directory: {}", e))?;

    for cue in [CueType::Start, CueType::Stop, CueType::Ready] {
        let target = default_cue_path(cue)?;
        if target.exists() {
            continue;
        }
        let resource_rel = format!("resources/sounds/{}", cue.default_file_name());
        let source = app
            .path()
            .resolve(&resource_rel, BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve bundled cue {}: {}", resource_rel, e))?;
        fs::copy(&source, &target).map_err(|e| {
            format!(
                "Failed to copy bundled cue from {:?} to {:?}: {}",
                source, target, e
            )
        })?;
    }
    Ok(())
}

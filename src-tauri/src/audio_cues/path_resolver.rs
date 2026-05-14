use crate::recording::AudioFeedbackConfig;
use crate::recording::get_storage_dir;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Which of the three cues is being referenced.
///
/// Serializes to camelCase ("start", "stop", "ready") so the Tauri commands
/// can be called from React with the same string literals used in the
/// `AudioFeedbackConfig` field names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CueType {
    Start,
    Stop,
    Ready,
}

impl CueType {
    /// File name (without directory) for the bundled default of this cue.
    pub fn default_file_name(&self) -> &'static str {
        match self {
            CueType::Start => "start.wav",
            CueType::Stop => "stop.wav",
            CueType::Ready => "ready.wav",
        }
    }
}

/// Absolute path to the bundled default for a cue inside the user's editable
/// sounds folder (`<documents>/ThoughtCast/sounds/<file>.wav`).
///
/// This is the path the Settings UI shows when no custom file is selected, and
/// the path playback falls back to when the user-configured custom file is
/// missing.
pub fn default_cue_path(cue: CueType) -> Result<PathBuf, String> {
    let storage_dir = get_storage_dir()?;
    Ok(storage_dir.join("sounds").join(cue.default_file_name()))
}

/// Resolves the actual on-disk path to use for a cue given the persisted config.
///
/// Resolution order:
/// 1. If the config specifies a non-empty custom path and it exists, use it.
/// 2. Otherwise fall back to the bundled default at
///    `<documents>/ThoughtCast/sounds/<cue>.wav`.
///
/// Missing-file recovery is intentional: per the PRD, a custom cue that goes
/// missing must not block recording — we silently fall back to the bundled
/// default rather than erroring out.
pub fn resolve_cue_path(
    cue: CueType,
    feedback: &AudioFeedbackConfig,
) -> Result<PathBuf, String> {
    let configured = match cue {
        CueType::Start => &feedback.start_cue_path,
        CueType::Stop => &feedback.stop_cue_path,
        CueType::Ready => &feedback.ready_cue_path,
    };

    if !configured.trim().is_empty() {
        let path = PathBuf::from(configured);
        if path.exists() {
            return Ok(path);
        }
    }

    default_cue_path(cue)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_file_name_per_cue() {
        assert_eq!(CueType::Start.default_file_name(), "start.wav");
        assert_eq!(CueType::Stop.default_file_name(), "stop.wav");
        assert_eq!(CueType::Ready.default_file_name(), "ready.wav");
    }

    #[test]
    fn test_cue_type_serializes_to_kebab_case() {
        // React side uses "start" / "stop" / "ready" as the command argument.
        let s = serde_json::to_string(&CueType::Start).unwrap();
        assert_eq!(s, "\"start\"");
        let s = serde_json::to_string(&CueType::Ready).unwrap();
        assert_eq!(s, "\"ready\"");
    }

    #[test]
    fn test_resolve_falls_back_when_path_missing() {
        let feedback = AudioFeedbackConfig {
            enabled: true,
            volume: 1.0,
            start_cue_path: "/definitely/does/not/exist.wav".to_string(),
            stop_cue_path: String::new(),
            ready_cue_path: String::new(),
        };
        // Resolution must not fail when the user's custom file is missing —
        // it falls back to the bundled default path (which may or may not
        // exist on the test machine, but resolution itself succeeds).
        let resolved = resolve_cue_path(CueType::Start, &feedback);
        assert!(resolved.is_ok());
        assert!(!resolved
            .unwrap()
            .to_string_lossy()
            .ends_with("does/not/exist.wav"));
    }
}

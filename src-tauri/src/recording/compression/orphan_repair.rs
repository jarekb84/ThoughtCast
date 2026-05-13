use crate::recording::session::storage::{load_sessions, save_sessions};
use crate::recording::utils::get_storage_dir;
use std::fs;
use std::path::PathBuf;

/// Outcome of a single orphan-repair pass.
#[derive(Debug, Clone, Default)]
pub struct OrphanRepairReport {
    pub session_paths_patched: u32,
    pub stale_temp_files_removed: u32,
}

/// Reconcile `sessions.json` references with the audio files actually on disk
/// and remove stray temp artefacts left behind by interrupted compression runs.
///
/// Specifically handles:
/// 1. Session whose `audio_path` ends in `.wav` but the file is missing while
///    the sibling `.m4a` exists — patch the index to point at the `.m4a`.
/// 2. Session whose `audio_path` ends in `.m4a` but only the `.wav` exists —
///    patch the index back to the `.wav` (rare, would mean atomic_replace was
///    interrupted between index update and m4a rename).
/// 3. Stale `*.m4a.tmp` files in the audio directory — delete them.
///
/// Best-effort: errors on individual entries are logged and skipped, never
/// bubbled up to abort startup.
pub fn repair_orphaned_session_references() -> Result<OrphanRepairReport, String> {
    let storage_dir = get_storage_dir()?;
    let audio_dir = storage_dir.join("audio");
    let mut report = OrphanRepairReport::default();

    if audio_dir.exists() {
        report.stale_temp_files_removed = remove_stale_temp_files(&audio_dir);
    }

    let mut index = load_sessions()?;
    let mut mutated = false;

    for session in index.sessions.iter_mut() {
        if session.audio_path.is_empty() {
            continue;
        }
        let absolute = storage_dir.join(&session.audio_path);
        if absolute.exists() {
            continue;
        }

        if let Some(swapped) = swap_extension_path(&session.audio_path) {
            let swapped_absolute = storage_dir.join(&swapped);
            if swapped_absolute.exists() {
                log::info!(
                    "Orphan repair: patching session {} {} -> {}",
                    session.id,
                    session.audio_path,
                    swapped
                );
                session.audio_path = swapped;
                report.session_paths_patched += 1;
                mutated = true;
            }
        }
    }

    if mutated {
        save_sessions(&index)?;
    }

    Ok(report)
}

/// Given a `.wav` path return the sibling `.m4a` path (and vice-versa), or
/// None if the extension isn't one we manage.
fn swap_extension_path(audio_relative: &str) -> Option<String> {
    let lower = audio_relative.to_lowercase();
    if lower.ends_with(".wav") {
        let stem = &audio_relative[..audio_relative.len() - 4];
        Some(format!("{}.m4a", stem))
    } else if lower.ends_with(".m4a") {
        let stem = &audio_relative[..audio_relative.len() - 4];
        Some(format!("{}.wav", stem))
    } else {
        None
    }
}

fn remove_stale_temp_files(audio_dir: &std::path::Path) -> u32 {
    let entries = match fs::read_dir(audio_dir) {
        Ok(it) => it,
        Err(_) => return 0,
    };
    let mut removed: u32 = 0;
    for entry_result in entries {
        let path: PathBuf = match entry_result {
            Ok(e) => e.path(),
            Err(_) => continue,
        };
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.to_lowercase().ends_with(".m4a.tmp"))
            .unwrap_or(false)
        {
            if fs::remove_file(&path).is_ok() {
                log::info!("Orphan repair: removed stale temp {}", path.display());
                removed += 1;
            }
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_swap_extension_wav_to_m4a() {
        assert_eq!(
            swap_extension_path("audio/2024-11-02_15.wav"),
            Some("audio/2024-11-02_15.m4a".to_string())
        );
    }

    #[test]
    fn test_swap_extension_m4a_to_wav() {
        assert_eq!(
            swap_extension_path("audio/2024-11-02_15.m4a"),
            Some("audio/2024-11-02_15.wav".to_string())
        );
    }

    #[test]
    fn test_swap_extension_unknown_returns_none() {
        assert_eq!(swap_extension_path("audio/foo.mp3"), None);
        assert_eq!(swap_extension_path(""), None);
    }

    #[test]
    fn test_swap_extension_case_insensitive_match() {
        assert_eq!(
            swap_extension_path("audio/X.WAV"),
            Some("audio/X.m4a".to_string())
        );
    }
}

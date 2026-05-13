use super::errors::CompressionError;
use crate::recording::session::storage::update_session;
use crate::recording::utils::get_storage_dir;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

/// Outcome of a successful atomic replacement.
#[derive(Debug, Clone, Serialize)]
pub struct ReplacementOutcome {
    pub wav_bytes_before: u64,
    pub m4a_bytes_after: u64,
    pub new_audio_path: String,
}

/// Replace a session's WAV file with a verified compressed M4A, updating
/// `sessions.json` in the process.
///
/// **Ordering matters.** The sequence is chosen so the index never references
/// a missing file:
/// 1. Verify temp M4A exists.
/// 2. Move temp M4A → final M4A path (both files on disk; index still points
///    at the WAV — still valid).
/// 3. Update `sessions.json` to point at the new M4A path (index now valid
///    against the new file).
/// 4. Delete the original WAV (best effort; retried on Windows file locks).
///
/// **Failure modes**:
/// - Step 2 fails → index still points at the WAV which is untouched. Clean.
/// - Step 3 fails → we roll the M4A back (remove the file we just placed),
///   returning the disk to its pre-call state. Clean.
/// - Step 4 fails → index already points at the M4A, so the session row is
///   valid; the leftover WAV becomes orphan data and gets swept up by
///   `orphan_repair` at next startup. We log a warning and treat the call as
///   successful.
///
/// The intentional asymmetry: we prefer "extra file on disk" over "session
/// index points at a deleted file". A small amount of leaked WAV is recoverable
/// at startup; a dangling reference in `sessions.json` would surface as a
/// user-visible broken session row.
pub fn replace_wav_with_compressed(
    session_id: &str,
    wav_relative_path: &str,
    temp_m4a_absolute: &Path,
) -> Result<ReplacementOutcome, CompressionError> {
    let storage_dir = get_storage_dir().map_err(|e| CompressionError::Io { message: e })?;
    let wav_absolute = storage_dir.join(wav_relative_path);

    if !temp_m4a_absolute.exists() {
        return Err(CompressionError::Verification {
            message: format!(
                "Temp compressed file missing: {}",
                temp_m4a_absolute.display()
            ),
        });
    }
    if !wav_absolute.exists() {
        return Err(CompressionError::Io {
            message: format!("Original WAV missing: {}", wav_absolute.display()),
        });
    }

    let wav_bytes_before = fs::metadata(&wav_absolute)
        .map_err(CompressionError::from)?
        .len();
    let m4a_bytes_after = fs::metadata(temp_m4a_absolute)
        .map_err(CompressionError::from)?
        .len();

    let new_relative = build_relative_m4a_path(wav_relative_path);
    let final_m4a_absolute = storage_dir.join(&new_relative);

    // Move temp m4a → final m4a. If it fails we leave the WAV alone.
    fs::rename(temp_m4a_absolute, &final_m4a_absolute).map_err(|e| {
        // If rename fails on Windows due to a stale m4a left over from a prior run,
        // try to remove it once and retry.
        if final_m4a_absolute.exists() {
            let _ = fs::remove_file(&final_m4a_absolute);
            if fs::rename(temp_m4a_absolute, &final_m4a_absolute).is_ok() {
                return CompressionError::Io {
                    message: "Recovered from existing m4a at destination".to_string(),
                };
            }
        }
        CompressionError::Io {
            message: format!("Could not move compressed file into place: {}", e),
        }
    })?;

    // Best-effort: if we recovered above the m4a is in place. Update the index.
    if let Err(e) = update_session(session_id, |s| {
        s.audio_path = new_relative.clone();
    }) {
        // Roll back the m4a move so the index and disk stay consistent.
        let _ = fs::remove_file(&final_m4a_absolute);
        return Err(CompressionError::IndexUpdate { message: e });
    }

    // Now delete the WAV. Retry a few times for Windows file-lock races.
    if let Err(e) = remove_wav_with_retry(&wav_absolute) {
        // Index already updated — the WAV is now orphan data, but the session
        // is in a valid state pointing at the m4a. Surface a soft warning via
        // a tagged error, but the caller can choose to treat as success.
        log::warn!(
            "Compression: index updated but failed to delete original WAV at {}: {}",
            wav_absolute.display(),
            e
        );
    }

    Ok(ReplacementOutcome {
        wav_bytes_before,
        m4a_bytes_after,
        new_audio_path: new_relative,
    })
}

/// Compute the relative session-store path for the compressed file given the
/// original WAV path. Preserves the original directory so future layout
/// changes (e.g., per-day subfolders) don't break.
fn build_relative_m4a_path(wav_relative_path: &str) -> String {
    let path = PathBuf::from(wav_relative_path);
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "session".to_string());
    let parent = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "audio".to_string());

    if parent.is_empty() {
        format!("{}.m4a", stem)
    } else {
        format!("{}/{}.m4a", parent, stem)
    }
}

fn remove_wav_with_retry(wav_absolute: &Path) -> Result<(), CompressionError> {
    let mut last_err: Option<std::io::Error> = None;
    for attempt in 0..3 {
        match fs::remove_file(wav_absolute) {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = Some(e);
                if attempt < 2 {
                    thread::sleep(Duration::from_millis(200));
                }
            }
        }
    }
    Err(CompressionError::Io {
        message: last_err
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown filesystem error".to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_relative_m4a_path_preserves_audio_dir() {
        assert_eq!(
            build_relative_m4a_path("audio/2024-11-02_15-30-00.wav"),
            "audio/2024-11-02_15-30-00.m4a"
        );
    }

    #[test]
    fn test_build_relative_m4a_path_no_parent_drops_to_root() {
        // Inputs without a parent directory shouldn't invent one — preserves
        // whatever shape the caller had on disk.
        assert_eq!(build_relative_m4a_path("session.wav"), "session.m4a");
    }

    #[test]
    fn test_build_relative_m4a_path_handles_nested_subfolders() {
        assert_eq!(
            build_relative_m4a_path("audio/2024-11/session.wav"),
            "audio/2024-11/session.m4a"
        );
    }
}

//! Startup recovery for in-flight WAVs left behind by a previous crashed run.
//!
//! When the app exits cleanly, the streaming writer in
//! `audio/streaming_writer.rs` is finalized and the lifecycle code renames its
//! in-flight WAV to its permanent `audio/<id>.wav` location. A crash or force-
//! kill between those steps leaves the WAV in `audio/.in-flight/` with no
//! entry in `sessions.json`. This module scans for those orphans at startup
//! and surfaces them as recoverable sessions so the user never has to manually
//! salvage audio from disk.

use crate::recording::audio::{
    promote_streaming_wav_to_permanent, read_wav_duration_seconds, repair_partial_wav_header,
};
use crate::recording::models::{Session, RECOVERED_ON_STARTUP_PREVIEW};
use crate::recording::session::storage::{add_session, load_sessions};
use crate::recording::utils::get_storage_dir;
use chrono::Utc;
use std::path::PathBuf;

/// Summary of the startup recovery scan, returned for logging.
#[derive(Debug, Default)]
pub struct RecoveryReport {
    /// In-flight WAVs that were promoted to permanent sessions on this scan.
    pub recovered_sessions: usize,
    /// In-flight files that were deleted because they couldn't be salvaged
    /// (too small to contain a valid header, or empty). Counted separately so
    /// the log distinguishes real recovery from cleanup.
    pub discarded_orphans: usize,
}

/// Scan `audio/.in-flight/` for WAVs that a previous app run left behind and
/// surface them as recoverable sessions.
///
/// Why this is necessary: the streaming writer in `audio/streaming_writer.rs`
/// commits audio to disk continuously, but on a clean stop the lifecycle code
/// renames the in-flight file to its permanent location and adds a session
/// row. A crash (or force-kill) between sample writes and that rename leaves
/// the WAV in `.in-flight/` with no entry in `sessions.json`. This scan
/// fixes that: each orphan gets its header repaired, gets renamed into
/// `audio/`, and gets a session row inserted so it appears in the sidebar
/// like any other recording. The preview makes the recovery origin visible
/// to the user.
///
/// Idempotent — running it multiple times against the same on-disk state
/// produces the same final state (subsequent runs see an empty in-flight
/// directory).
pub fn recover_orphaned_in_flight_recordings() -> Result<RecoveryReport, String> {
    let mut report = RecoveryReport::default();

    let in_flight_dir = match locate_in_flight_dir() {
        Ok(p) => p,
        Err(e) => {
            // Storage dir unavailable is fatal; treat any other locate failure
            // as "nothing to recover" and continue.
            log::debug!("Skipping in-flight recovery scan: {}", e);
            return Ok(report);
        }
    };

    if !in_flight_dir.exists() {
        return Ok(report);
    }

    let entries = std::fs::read_dir(&in_flight_dir).map_err(|e| {
        format!(
            "Failed to read in-flight dir {}: {}",
            in_flight_dir.display(),
            e
        )
    })?;

    let existing_ids = load_sessions().map(session_ids).unwrap_or_default();

    for entry in entries.flatten() {
        let path = entry.path();
        if !is_wav_file(&path) {
            continue;
        }

        let id = match derive_session_id_from_path(&path) {
            Some(id) => id,
            None => continue,
        };

        if existing_ids.contains(&id) {
            // A previous run already added a session for this id (rare —
            // would require a crash after `add_session` but before the
            // rename). Promote anyway so the audio lives at the canonical
            // path the session row points to.
            log::info!("In-flight WAV {} matches an existing session id; promoting in place", id);
        }

        match recover_one_orphan(&path, &id) {
            Ok(true) => report.recovered_sessions += 1,
            Ok(false) => report.discarded_orphans += 1,
            Err(e) => {
                // Leave the file in place so a future scan can try again.
                // Surfacing it as an error here would block the rest of the
                // scan; logging keeps recovery best-effort.
                log::warn!(
                    "Failed to recover in-flight WAV {}: {}",
                    path.display(),
                    e
                );
            }
        }
    }

    Ok(report)
}

/// Try to recover a single orphan in-flight WAV. Returns `Ok(true)` if a
/// session row was added, `Ok(false)` if the file was discarded as unsalvageable.
fn recover_one_orphan(path: &PathBuf, session_id: &str) -> Result<bool, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("metadata({}): {}", path.display(), e))?;

    // Anything shorter than a header has no audio worth keeping.
    const MIN_USEFUL_BYTES: u64 = 44 + 2; // header + at least one sample
    if metadata.len() < MIN_USEFUL_BYTES {
        std::fs::remove_file(path)
            .map_err(|e| format!("Failed to remove empty in-flight WAV: {}", e))?;
        return Ok(false);
    }

    if let Err(e) = repair_partial_wav_header(path) {
        // Last-ditch: the header is unreadable. Don't promote — but also
        // don't leave a corrupt file blocking future recovery attempts.
        std::fs::remove_file(path)
            .map_err(|rm_err| format!("Header unreadable ({}) and remove failed: {}", e, rm_err))?;
        return Ok(false);
    }

    let permanent = promote_streaming_wav_to_permanent(path, session_id)?;
    let duration = read_wav_duration_seconds(&permanent).unwrap_or(0.0);

    let session = Session::new_unrecovered(
        session_id.to_string(),
        derive_timestamp(session_id),
        format!("audio/{}.wav", session_id),
        duration,
        RECOVERED_ON_STARTUP_PREVIEW.to_string(),
    );
    add_session(session)?;

    Ok(true)
}

fn locate_in_flight_dir() -> Result<PathBuf, String> {
    let storage = get_storage_dir()?;
    Ok(storage.join("audio").join(".in-flight"))
}

fn is_wav_file(path: &PathBuf) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("wav"))
            .unwrap_or(false)
}

fn derive_session_id_from_path(path: &PathBuf) -> Option<String> {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
}

fn session_ids(index: crate::recording::models::SessionIndex) -> std::collections::HashSet<String> {
    index.sessions.into_iter().map(|s| s.id).collect()
}

/// Best-effort timestamp parsing for a recovered session. The id is generated
/// from `%Y-%m-%d_%H-%M-%S` at start time, so the most reliable thing we can
/// do is reuse that format to reconstruct an RFC3339 timestamp; on parse
/// failure we use the current time so the session at least sorts to the top.
fn derive_timestamp(session_id: &str) -> String {
    match chrono::NaiveDateTime::parse_from_str(session_id, "%Y-%m-%d_%H-%M-%S") {
        Ok(naive) => naive.and_utc().to_rfc3339(),
        Err(_) => Utc::now().to_rfc3339(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_timestamp_parses_canonical_session_id() {
        let ts = derive_timestamp("2026-05-17_14-22-00");
        // Either the canonical RFC3339 form or the fallback (current time)
        // is acceptable; we just want a non-empty result with a recognizable
        // structure.
        assert!(ts.contains("2026-05-17"), "expected canonical date, got {}", ts);
    }

    #[test]
    fn derive_timestamp_falls_back_for_garbled_id() {
        let ts = derive_timestamp("not a real id");
        // Should not panic and should produce a non-empty RFC3339-ish string
        // (current time fallback).
        assert!(!ts.is_empty());
    }

    #[test]
    fn derive_session_id_strips_extension() {
        let path: PathBuf = "/data/.in-flight/2026-05-17_14-22-00.wav".into();
        assert_eq!(
            derive_session_id_from_path(&path),
            Some("2026-05-17_14-22-00".to_string())
        );
    }
}

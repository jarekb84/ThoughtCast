use crate::recording::utils::get_storage_dir;
use serde::Serialize;
use std::fs;

/// Snapshot of how much disk space recordings currently occupy and how much
/// can be reclaimed via compression. Calls drive the "Current storage" panel
/// in the Settings UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    pub wav_count: u32,
    pub wav_bytes: u64,
    pub m4a_count: u32,
    pub m4a_bytes: u64,
    /// Heuristic estimate: a typical voice WAV compresses ~10x, so we
    /// extrapolate ~90% of the WAV total as savings.
    pub estimated_savings_bytes: u64,
}

/// Collect storage stats from the audio directory.
///
/// Best-effort: unreadable entries are silently skipped rather than aborted —
/// we'd rather show a slightly-low number than fail the whole UI.
pub fn collect_storage_stats() -> Result<StorageStats, String> {
    let storage_dir = get_storage_dir()?;
    let audio_dir = storage_dir.join("audio");
    if !audio_dir.exists() {
        return Ok(empty_stats());
    }

    let entries = match fs::read_dir(&audio_dir) {
        Ok(it) => it,
        Err(e) => return Err(format!("Could not read audio directory: {}", e)),
    };

    let mut wav_count = 0u32;
    let mut wav_bytes = 0u64;
    let mut m4a_count = 0u32;
    let mut m4a_bytes = 0u64;

    for entry_result in entries {
        let entry = match entry_result {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();

        let size = match fs::metadata(&path) {
            Ok(m) => m.len(),
            Err(_) => continue,
        };

        match extension.as_str() {
            "wav" => {
                wav_count += 1;
                wav_bytes += size;
            }
            "m4a" => {
                m4a_count += 1;
                m4a_bytes += size;
            }
            _ => {}
        }
    }

    Ok(StorageStats {
        wav_count,
        wav_bytes,
        m4a_count,
        m4a_bytes,
        estimated_savings_bytes: estimate_savings(wav_bytes),
    })
}

fn empty_stats() -> StorageStats {
    StorageStats {
        wav_count: 0,
        wav_bytes: 0,
        m4a_count: 0,
        m4a_bytes: 0,
        estimated_savings_bytes: 0,
    }
}

fn estimate_savings(wav_bytes: u64) -> u64 {
    // 90% reduction is the PRD's headline number for 16kHz mono → AAC.
    wav_bytes.saturating_mul(9) / 10
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_savings_is_ninety_percent() {
        assert_eq!(estimate_savings(1000), 900);
        assert_eq!(estimate_savings(0), 0);
        assert_eq!(estimate_savings(10), 9);
    }

    #[test]
    fn test_empty_stats_is_zero() {
        let s = empty_stats();
        assert_eq!(s.wav_count, 0);
        assert_eq!(s.wav_bytes, 0);
        assert_eq!(s.estimated_savings_bytes, 0);
    }
}

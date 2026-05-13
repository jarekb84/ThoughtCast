use crate::recording::utils::get_storage_dir;
use std::fs;

/// Sanity check that performs a tiny write probe to confirm the audio
/// directory is writable. We deliberately don't try to compute "free bytes" —
/// platforms expose this very inconsistently and the value can be stale by
/// the time we read it. The probe is good enough: if the platform can't write
/// a 1-byte file here, the batch shouldn't start.
pub fn audio_dir_is_writable() -> bool {
    let storage_dir = match get_storage_dir() {
        Ok(d) => d,
        Err(_) => return false,
    };
    let audio_dir = storage_dir.join("audio");
    if !audio_dir.exists() {
        return false;
    }

    let probe = audio_dir.join(".compression_probe");
    let write_ok = fs::write(&probe, b"\0").is_ok();
    let _ = fs::remove_file(&probe);
    write_ok
}

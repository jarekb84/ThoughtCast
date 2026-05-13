use super::{
    compress_wav_to_m4a, errors::CompressionError, replace_wav_with_compressed, ReplacementOutcome,
};
use crate::recording::config::load_config;
use crate::recording::utils::get_storage_dir;
use serde::Serialize;
use std::path::PathBuf;

/// Event payload emitted to the frontend when a session's audio file has been
/// successfully compressed after transcription.
#[derive(Debug, Clone, Serialize)]
pub struct SessionAudioCompressedEvent {
    pub session_id: String,
    pub new_audio_path: String,
    pub bytes_freed: u64,
}

/// Best-effort post-transcription compression of a single session.
///
/// Returns `Ok(Some(event))` when compression actually ran and succeeded,
/// `Ok(None)` when the user has compression disabled (no work to do, not an
/// error), and `Err(_)` when compression was attempted and failed. Callers
/// should treat failures as non-fatal: the recording is preserved as WAV, the
/// session row is valid, and the file becomes eligible for a future batch sweep.
pub fn run_post_transcription_compression(
    session_id: &str,
    wav_relative_path: &str,
) -> Result<Option<SessionAudioCompressedEvent>, CompressionError> {
    let config = load_config().map_err(|e| CompressionError::Io { message: e })?;

    if !config.audio_compression.compress_new_recordings {
        return Ok(None);
    }

    let storage_dir = get_storage_dir().map_err(|e| CompressionError::Io { message: e })?;
    let wav_absolute = storage_dir.join(wav_relative_path);

    // Build the temp path next to the eventual final location so the atomic
    // rename within `replace_wav_with_compressed` is on the same filesystem.
    let temp_m4a: PathBuf = derive_temp_m4a_path(&wav_absolute);

    compress_wav_to_m4a(&config.ffmpeg_path, &wav_absolute, &temp_m4a)?;

    let outcome: ReplacementOutcome =
        replace_wav_with_compressed(session_id, wav_relative_path, &temp_m4a)?;

    Ok(Some(SessionAudioCompressedEvent {
        session_id: session_id.to_string(),
        new_audio_path: outcome.new_audio_path,
        bytes_freed: outcome.wav_bytes_before.saturating_sub(outcome.m4a_bytes_after),
    }))
}

/// Build the sibling temp path used during the WAV → M4A conversion.
///
/// We deliberately keep the temp file next to the eventual destination so that
/// when atomic_replace renames it, both source and destination live on the
/// same filesystem (rename across filesystems would silently degrade to a
/// copy+delete and lose its atomicity).
fn derive_temp_m4a_path(wav_absolute: &std::path::Path) -> PathBuf {
    let mut temp = wav_absolute.to_path_buf();
    temp.set_extension("m4a.tmp");
    temp
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_derive_temp_m4a_path_swaps_extension() {
        let wav = Path::new("/some/dir/2024-11-02_15-30-00.wav");
        let temp = derive_temp_m4a_path(wav);
        assert_eq!(
            temp.to_string_lossy(),
            "/some/dir/2024-11-02_15-30-00.m4a.tmp"
        );
    }
}

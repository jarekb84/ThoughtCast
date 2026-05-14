use serde::Serialize;
use std::fs;
use std::path::Path;

/// Result of probing a candidate audio file the user picked in Settings.
#[derive(Debug, Clone, Serialize)]
pub struct AudioFileValidation {
    pub exists: bool,
    /// True when the extension is one rodio can decode (wav/mp3/ogg/flac).
    pub format_ok: bool,
    /// File size in bytes; useful for the UI to gate huge picks.
    pub size_bytes: u64,
    /// Whether `size_bytes` is within the documented cap (see [`MAX_BYTES`]).
    pub size_ok: bool,
    /// Human-readable message suitable for inline display.
    pub message: String,
}

/// Soft cap on cue-file size. The PRD calls out a "reasonable size cap" — at
/// ~10 MB even a high-bitrate MP3 holds many minutes of audio, far beyond any
/// reasonable cue length. We reject larger files to keep startup and memory
/// behavior predictable.
pub const MAX_BYTES: u64 = 10 * 1024 * 1024;

const SUPPORTED_EXTENSIONS: &[&str] = &["wav", "mp3", "ogg", "oga", "flac"];

/// Probes a candidate audio file path for the file picker UI in Settings.
///
/// Does not actually decode the file — only checks existence, extension, and
/// size. Decoding errors at playback time are caught separately and fall back
/// to the bundled default for that cue (PRD edge case 10).
pub fn validate_audio_file(path: &Path) -> AudioFileValidation {
    let exists = path.exists();
    if !exists {
        return AudioFileValidation {
            exists: false,
            format_ok: false,
            size_bytes: 0,
            size_ok: false,
            message: "File does not exist".to_string(),
        };
    }

    let format_ok = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false);

    let size_bytes = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let size_ok = size_bytes <= MAX_BYTES;

    let message = if !format_ok {
        "Unsupported format — use WAV, MP3, OGG, or FLAC".to_string()
    } else if !size_ok {
        format!(
            "File is {} MB; cap is {} MB",
            size_bytes / 1024 / 1024,
            MAX_BYTES / 1024 / 1024
        )
    } else {
        format!("Looks good ({} KB)", size_bytes / 1024)
    };

    AudioFileValidation {
        exists,
        format_ok,
        size_bytes,
        size_ok,
        message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_missing_file_reports_does_not_exist() {
        let v = validate_audio_file(Path::new("/definitely/missing.wav"));
        assert!(!v.exists);
        assert!(!v.format_ok);
        assert!(!v.size_ok);
    }

    #[test]
    fn test_wrong_extension_flagged() {
        let dir = std::env::temp_dir();
        let path = dir.join("thoughtcast_test_validator.docx");
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(b"hello").unwrap();
        let v = validate_audio_file(&path);
        assert!(v.exists);
        assert!(!v.format_ok);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_valid_wav_passes() {
        let dir = std::env::temp_dir();
        let path = dir.join("thoughtcast_test_validator.wav");
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(b"RIFFnotarealwavfile").unwrap();
        let v = validate_audio_file(&path);
        assert!(v.exists);
        assert!(v.format_ok);
        assert!(v.size_ok);
        let _ = std::fs::remove_file(&path);
    }
}

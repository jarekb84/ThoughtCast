use serde::Serialize;
use std::path::Path;
use std::process::Command;

/// What kind of file we're validating — drives which checks to run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PathKind {
    /// An executable binary that should respond to `--version` or `-version`.
    Executable,
    /// A regular data file (e.g., the Whisper model `.bin`).
    File,
    /// Specifically the FFmpeg executable — runs `ffmpeg -version` to detect.
    Ffmpeg,
}

/// Result of validating a configured path.
///
/// `exists` and `kind_ok` are independent: a path can exist but be the wrong
/// kind (a directory where a binary was expected), or the right kind but missing.
#[derive(Debug, Clone, Serialize)]
pub struct PathValidation {
    pub exists: bool,
    pub kind_ok: bool,
    pub version: Option<String>,
    pub message: String,
}

impl PathValidation {
    fn missing() -> Self {
        Self {
            exists: false,
            kind_ok: false,
            version: None,
            message: "File does not exist at the given path".to_string(),
        }
    }

    fn empty() -> Self {
        Self {
            exists: false,
            kind_ok: false,
            version: None,
            message: "Path is empty".to_string(),
        }
    }
}

/// Validate a configured path according to its expected kind.
///
/// Pure entry point for both the Settings panel "is this configured correctly?"
/// status indicator and pre-flight checks before running Whisper or FFmpeg.
pub fn validate_path(path: &str, kind: PathKind) -> PathValidation {
    if path.trim().is_empty() {
        return PathValidation::empty();
    }

    let p = Path::new(path);
    if !p.exists() {
        return PathValidation::missing();
    }

    if !p.is_file() {
        return PathValidation {
            exists: true,
            kind_ok: false,
            version: None,
            message: "Path exists but is not a file".to_string(),
        };
    }

    match kind {
        PathKind::File => PathValidation {
            exists: true,
            kind_ok: true,
            version: None,
            message: "File found".to_string(),
        },
        PathKind::Executable => PathValidation {
            exists: true,
            kind_ok: true,
            version: None,
            message: "Executable found".to_string(),
        },
        PathKind::Ffmpeg => detect_ffmpeg_version(path),
    }
}

/// Probe an ffmpeg binary by running `ffmpeg -version` and parsing the first line.
///
/// We don't fail validation if version parsing fails — the binary running at all
/// is the meaningful signal.
fn detect_ffmpeg_version(path: &str) -> PathValidation {
    let output_result = build_ffmpeg_version_command(path).output();

    let output = match output_result {
        Ok(o) => o,
        Err(_) => {
            return PathValidation {
                exists: true,
                kind_ok: false,
                version: None,
                message: "Found a file at this path but it failed to launch as a process"
                    .to_string(),
            };
        }
    };

    if !output.status.success() {
        return PathValidation {
            exists: true,
            kind_ok: false,
            version: None,
            message: "Binary launched but did not respond to `-version` — is this FFmpeg?"
                .to_string(),
        };
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let version = parse_ffmpeg_version_line(&stdout);
    let message = version
        .as_ref()
        .map(|v| format!("FFmpeg detected ({})", v))
        .unwrap_or_else(|| "FFmpeg detected".to_string());

    PathValidation {
        exists: true,
        kind_ok: true,
        version,
        message,
    }
}

fn build_ffmpeg_version_command(path: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut cmd = Command::new(path);
        cmd.arg("-version").creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new(path);
        cmd.arg("-version");
        cmd
    }
}

/// Parse the first non-empty line of `ffmpeg -version` output to extract the
/// version token (e.g., "ffmpeg version 6.1.1-essentials_build-www.gyan.dev").
pub fn parse_ffmpeg_version_line(stdout: &str) -> Option<String> {
    let first_line = stdout.lines().find(|l| !l.trim().is_empty())?;
    // Typical format: "ffmpeg version 6.1 Copyright (c) 2000-2023 ..."
    let after_prefix = first_line.strip_prefix("ffmpeg version ")?;
    let token = after_prefix.split_whitespace().next()?;
    Some(token.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_path_returns_empty_validation() {
        let v = validate_path("", PathKind::Executable);
        assert!(!v.exists);
        assert!(!v.kind_ok);
        assert!(v.message.contains("empty"));
    }

    #[test]
    fn test_whitespace_only_path_treated_as_empty() {
        let v = validate_path("   ", PathKind::Executable);
        assert!(!v.exists);
        assert!(v.message.contains("empty"));
    }

    #[test]
    fn test_missing_path_returns_missing_validation() {
        let v = validate_path("/definitely/does/not/exist/ffmpeg", PathKind::Ffmpeg);
        assert!(!v.exists);
        assert!(!v.kind_ok);
    }

    #[test]
    fn test_parse_ffmpeg_version_line_standard_format() {
        let stdout = "ffmpeg version 6.1 Copyright (c) 2000-2023 the FFmpeg developers\nbuilt with ...";
        assert_eq!(parse_ffmpeg_version_line(stdout), Some("6.1".to_string()));
    }

    #[test]
    fn test_parse_ffmpeg_version_line_windows_build() {
        let stdout = "ffmpeg version n6.1.1-essentials_build-www.gyan.dev Copyright (c) ...\n";
        assert_eq!(
            parse_ffmpeg_version_line(stdout),
            Some("n6.1.1-essentials_build-www.gyan.dev".to_string())
        );
    }

    #[test]
    fn test_parse_ffmpeg_version_line_unrecognized() {
        let stdout = "some other tool version 1.0\n";
        assert_eq!(parse_ffmpeg_version_line(stdout), None);
    }

    #[test]
    fn test_parse_ffmpeg_version_line_empty() {
        assert_eq!(parse_ffmpeg_version_line(""), None);
    }
}

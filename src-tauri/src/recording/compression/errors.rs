use serde::Serialize;
use std::fmt;

/// Structured failure modes for the compression pipeline.
///
/// The granular variants exist so the UI can decide what to surface and what
/// to swallow (e.g., a missing FFmpeg path should prompt the user; a transient
/// I/O error during a batch is logged and the file skipped).
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CompressionError {
    FfmpegMissing { message: String },
    FfmpegFailed { message: String },
    Verification { message: String },
    Io { message: String },
    IndexUpdate { message: String },
}

impl fmt::Display for CompressionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CompressionError::FfmpegMissing { message }
            | CompressionError::FfmpegFailed { message }
            | CompressionError::Verification { message }
            | CompressionError::Io { message }
            | CompressionError::IndexUpdate { message } => f.write_str(message),
        }
    }
}

impl std::error::Error for CompressionError {}

impl From<std::io::Error> for CompressionError {
    fn from(value: std::io::Error) -> Self {
        CompressionError::Io {
            message: value.to_string(),
        }
    }
}

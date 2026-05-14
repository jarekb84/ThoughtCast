use serde::Serialize;
use std::fmt;

/// Structured failure modes for the silence-detect chunking pipeline.
///
/// Mirrors `compression::errors::CompressionError`'s shape so the same
/// "missing FFmpeg → silently disable, other errors → surface" disposition
/// logic can be reused at the orchestrator level.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChunkingError {
    FfmpegMissing { message: String },
    FfmpegFailed { message: String },
    Io { message: String },
}

impl fmt::Display for ChunkingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ChunkingError::FfmpegMissing { message }
            | ChunkingError::FfmpegFailed { message }
            | ChunkingError::Io { message } => f.write_str(message),
        }
    }
}

impl std::error::Error for ChunkingError {}

impl From<std::io::Error> for ChunkingError {
    fn from(value: std::io::Error) -> Self {
        ChunkingError::Io {
            message: value.to_string(),
        }
    }
}

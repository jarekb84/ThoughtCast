//! Silence-detect-based chunking of long recordings.
//!
//! - `silence_detector`: runs `ffmpeg -af silencedetect` and parses stderr
//! - `chunk_planner`: pure function that turns silence ranges into cut points
//! - `wav_splitter`: writes per-chunk WAV files via FFmpeg
//! - `errors`: structured failure modes shared across the module
//!
//! The orchestrator (in `transcription::chunked_orchestrator`) drives this
//! module sequentially: detect → plan → split → transcribe chunks → stitch.

pub mod chunk_planner;
pub mod errors;
pub mod silence_detector;
pub mod wav_splitter;

pub use chunk_planner::plan_cuts;
pub use errors::ChunkingError;
pub use silence_detector::detect_silences;
pub use wav_splitter::split_wav;

use crate::recording::models::AudioChunkingConfig;
use std::path::{Path, PathBuf};
use std::time::Instant;

/// Result of running silence detection, planning, and splitting on a WAV.
/// The orchestrator uses this to drive sequential transcription and to
/// record chunking telemetry on the session.
#[derive(Debug)]
pub struct ChunkingOutcome {
    /// Per-chunk WAV files, in playback order. Caller owns cleanup.
    pub chunk_files: Vec<PathBuf>,
    /// Wall-clock seconds the silence-detect + split pass took.
    pub analysis_seconds: f64,
    /// True if the planner had to fall back to a hard cut for any window.
    pub used_fallback: bool,
}

/// Run the full plan-and-split pass: silence detect, plan, write chunk files.
///
/// `audio_duration_sec` is the recording's duration — used by the planner to
/// decide whether chunking is needed at all. `output_dir` must already exist;
/// the caller owns it and is responsible for cleanup once transcription is
/// done.
pub fn plan_and_split(
    ffmpeg_path: &str,
    source_wav: &Path,
    audio_duration_sec: f64,
    config: &AudioChunkingConfig,
    output_dir: &Path,
) -> Result<ChunkingOutcome, ChunkingError> {
    let start = Instant::now();

    let silences = detect_silences(
        ffmpeg_path,
        source_wav,
        config.silence_threshold_db,
        config.min_silence_duration_sec,
    )?;

    let plan = plan_cuts(
        audio_duration_sec,
        &silences,
        config.min_chunk_duration_sec,
        config.max_chunk_duration_sec,
    );

    let chunk_files = split_wav(ffmpeg_path, source_wav, &plan.chunks, output_dir)?;

    Ok(ChunkingOutcome {
        chunk_files,
        analysis_seconds: start.elapsed().as_secs_f64(),
        used_fallback: plan.used_fallback,
    })
}

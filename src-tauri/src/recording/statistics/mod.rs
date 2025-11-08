mod estimator;
mod models;

pub use estimator::estimate_transcription_time;
pub use models::{TranscriptionEstimate, TranscriptionStat, TranscriptionStats};

use crate::recording::models::Session;

/// Extract transcription timing statistics from sessions
///
/// Filters sessions that have complete transcription metadata (time + model)
/// and transforms them into the format expected by the estimator.
///
/// # Arguments
/// * `sessions` - Vector of sessions to extract statistics from
///
/// # Returns
/// TranscriptionStats containing only sessions with complete transcription metadata
pub fn extract_transcription_stats(sessions: &[Session]) -> TranscriptionStats {
    let stats: Vec<TranscriptionStat> = sessions
        .iter()
        .filter_map(|session| {
            // Only include sessions that have both transcription time and model path
            match (
                session.transcription_time_seconds,
                &session.model_path,
            ) {
                (Some(transcription_time), Some(model_path)) => {
                    Some(TranscriptionStat {
                        audio_duration_seconds: session.duration,
                        transcription_time_seconds: transcription_time,
                        timestamp: session.timestamp.clone(),
                        model_path: model_path.clone(),
                    })
                }
                _ => None,
            }
        })
        .collect();

    TranscriptionStats { version: 1, stats }
}

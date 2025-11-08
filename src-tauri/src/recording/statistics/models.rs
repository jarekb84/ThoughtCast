use serde::{Deserialize, Serialize};

/// A single transcription timing measurement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionStat {
    /// Duration of the audio file in seconds
    pub audio_duration_seconds: f64,
    /// Time taken to transcribe in seconds
    pub transcription_time_seconds: f64,
    /// ISO 8601 timestamp of when this transcription occurred
    pub timestamp: String,
    /// Path to the Whisper model used (for detecting model changes)
    pub model_path: String,
}

/// Container for all transcription statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionStats {
    /// Schema version for future migrations
    pub version: u32,
    /// List of all recorded transcription timing measurements
    pub stats: Vec<TranscriptionStat>,
}

impl Default for TranscriptionStats {
    fn default() -> Self {
        Self {
            version: 1,
            stats: Vec::new(),
        }
    }
}

/// Estimation result from historical data
#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionEstimate {
    /// Estimated transcription time in seconds
    #[serde(rename = "estimatedSeconds")]
    pub estimated_seconds: f64,
    /// Confidence level based on available data
    pub confidence: EstimateConfidence,
}

/// Confidence level for time estimates
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EstimateConfidence {
    None,   // < 10 data points - no estimate available
    Low,    // 10-20 data points
    Medium, // 20-50 data points
    High,   // 50+ data points
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stat_serialization() {
        let stat = TranscriptionStat {
            audio_duration_seconds: 300.0,
            transcription_time_seconds: 45.2,
            timestamp: "2024-11-08T15:30:00Z".to_string(),
            model_path: "/path/to/model.bin".to_string(),
        };

        let json = serde_json::to_string(&stat).unwrap();
        let deserialized: TranscriptionStat = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.audio_duration_seconds, 300.0);
        assert_eq!(deserialized.transcription_time_seconds, 45.2);
    }

    #[test]
    fn test_stats_container_default() {
        let stats = TranscriptionStats::default();

        assert_eq!(stats.version, 1);
        assert_eq!(stats.stats.len(), 0);
    }

    #[test]
    fn test_estimate_serialization() {
        let estimate = TranscriptionEstimate {
            estimated_seconds: 60.5,
            confidence: EstimateConfidence::High,
        };

        let json = serde_json::to_string(&estimate).unwrap();
        assert!(json.contains("estimatedSeconds")); // Check camelCase
        assert!(json.contains("60.5"));
        assert!(json.contains("\"high\""));
    }
}

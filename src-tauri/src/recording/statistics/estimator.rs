use super::models::{EstimateConfidence, TranscriptionEstimate, TranscriptionStats};

const MIN_STATS_FOR_ESTIMATE: usize = 10;
const LOW_CONFIDENCE_THRESHOLD: usize = 20;
const MEDIUM_CONFIDENCE_THRESHOLD: usize = 50;

/// Calculate transcription time estimate based on historical data
///
/// Returns None if insufficient data is available (< 10 data points)
///
/// Algorithm:
/// 1. Calculate ratio (transcription_time / audio_duration) for each historical stat
/// 2. Compute median ratio to avoid outlier influence
/// 3. Estimate = audio_duration * median_ratio
/// 4. Confidence level based on number of data points
pub fn estimate_transcription_time(
    stats: &TranscriptionStats,
    audio_duration_seconds: f64,
) -> Option<TranscriptionEstimate> {
    // Not enough data for reliable estimate
    if stats.stats.len() < MIN_STATS_FOR_ESTIMATE {
        return None;
    }

    // Calculate ratio for each stat: transcription_time / audio_duration
    let mut ratios: Vec<f64> = stats
        .stats
        .iter()
        .filter(|s| s.audio_duration_seconds > 0.0) // Avoid division by zero
        .map(|s| s.transcription_time_seconds / s.audio_duration_seconds)
        .collect();

    if ratios.is_empty() {
        return None;
    }

    // Calculate median ratio (more robust than mean against outliers)
    ratios.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median_ratio = if ratios.len() % 2 == 0 {
        let mid = ratios.len() / 2;
        (ratios[mid - 1] + ratios[mid]) / 2.0
    } else {
        ratios[ratios.len() / 2]
    };

    // Calculate estimate
    let estimated_seconds = audio_duration_seconds * median_ratio;

    // Determine confidence based on data point count
    let confidence = match stats.stats.len() {
        n if n < MIN_STATS_FOR_ESTIMATE => EstimateConfidence::None,
        n if n < LOW_CONFIDENCE_THRESHOLD => EstimateConfidence::Low,
        n if n < MEDIUM_CONFIDENCE_THRESHOLD => EstimateConfidence::Medium,
        _ => EstimateConfidence::High,
    };

    Some(TranscriptionEstimate {
        estimated_seconds,
        confidence,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recording::statistics::models::{TranscriptionStat, TranscriptionStats};

    fn create_test_stats(count: usize, ratio: f64) -> TranscriptionStats {
        let mut stats = TranscriptionStats::default();
        for i in 0..count {
            let audio_duration = 60.0 * (i + 1) as f64; // 60s, 120s, 180s...
            stats.stats.push(TranscriptionStat {
                audio_duration_seconds: audio_duration,
                transcription_time_seconds: audio_duration * ratio,
                timestamp: format!("2024-11-08T15:{}:00Z", i),
                model_path: "/test/model.bin".to_string(),
            });
        }
        stats
    }

    #[test]
    fn test_insufficient_data_returns_none() {
        let stats = create_test_stats(5, 0.15); // Only 5 data points
        let estimate = estimate_transcription_time(&stats, 300.0);

        assert!(estimate.is_none());
    }

    #[test]
    fn test_estimate_with_low_confidence() {
        let stats = create_test_stats(15, 0.15); // 15 data points
        let estimate = estimate_transcription_time(&stats, 300.0).unwrap();

        // 300s * 0.15 = 45s expected
        assert!((estimate.estimated_seconds - 45.0).abs() < 0.1);

        // Should be low confidence (10-20 data points)
        matches!(estimate.confidence, EstimateConfidence::Low);
    }

    #[test]
    fn test_estimate_with_medium_confidence() {
        let stats = create_test_stats(30, 0.2); // 30 data points
        let estimate = estimate_transcription_time(&stats, 180.0).unwrap();

        // 180s * 0.2 = 36s expected
        assert!((estimate.estimated_seconds - 36.0).abs() < 0.1);

        // Should be medium confidence (20-50 data points)
        matches!(estimate.confidence, EstimateConfidence::Medium);
    }

    #[test]
    fn test_estimate_with_high_confidence() {
        let stats = create_test_stats(60, 0.1); // 60 data points
        let estimate = estimate_transcription_time(&stats, 600.0).unwrap();

        // 600s * 0.1 = 60s expected
        assert!((estimate.estimated_seconds - 60.0).abs() < 0.1);

        // Should be high confidence (50+ data points)
        matches!(estimate.confidence, EstimateConfidence::High);
    }

    #[test]
    fn test_median_handles_outliers() {
        let mut stats = TranscriptionStats::default();

        // Most transcriptions take ~15% of audio duration
        for i in 0..20 {
            stats.stats.push(TranscriptionStat {
                audio_duration_seconds: 100.0,
                transcription_time_seconds: 15.0,
                timestamp: format!("2024-11-08T15:{}:00Z", i),
                model_path: "/test/model.bin".to_string(),
            });
        }

        // Add a few outliers (very slow transcriptions)
        stats.stats.push(TranscriptionStat {
            audio_duration_seconds: 100.0,
            transcription_time_seconds: 200.0, // 2x slower
            timestamp: "2024-11-08T16:00:00Z".to_string(),
            model_path: "/test/model.bin".to_string(),
        });

        let estimate = estimate_transcription_time(&stats, 100.0).unwrap();

        // Should be close to 15s (median), not affected much by the outlier
        assert!((estimate.estimated_seconds - 15.0).abs() < 2.0);
    }

    #[test]
    fn test_handles_zero_duration_gracefully() {
        let mut stats = TranscriptionStats::default();

        // Add some valid stats
        for i in 0..15 {
            stats.stats.push(TranscriptionStat {
                audio_duration_seconds: 60.0,
                transcription_time_seconds: 9.0,
                timestamp: format!("2024-11-08T15:{}:00Z", i),
                model_path: "/test/model.bin".to_string(),
            });
        }

        // Add a zero-duration stat (should be filtered out)
        stats.stats.push(TranscriptionStat {
            audio_duration_seconds: 0.0,
            transcription_time_seconds: 10.0,
            timestamp: "2024-11-08T16:00:00Z".to_string(),
            model_path: "/test/model.bin".to_string(),
        });

        let estimate = estimate_transcription_time(&stats, 120.0).unwrap();

        // Should estimate based on ratio 9/60 = 0.15
        // 120 * 0.15 = 18s
        assert!((estimate.estimated_seconds - 18.0).abs() < 0.1);
    }
}

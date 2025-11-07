use std::sync::{Arc, Mutex};

/// Configuration for audio level calculation
const SAMPLES_PER_LEVEL: usize = 800; // ~50ms at 16kHz (approximately 20 updates per second)
const MAX_LEVELS: usize = 20; // Store last 20 levels (~1 second of history)

/// Calculate RMS (Root Mean Square) amplitude for a slice of audio samples
///
/// RMS provides a more perceptually accurate representation of loudness
/// than simple peak or average amplitude.
///
/// Returns a value between 0.0 (silence) and 1.0 (maximum amplitude)
fn calculate_rms_amplitude(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

    // Calculate sum of squares
    let sum_of_squares: f32 = samples.iter().map(|&sample| sample * sample).sum();

    // Calculate mean and take square root
    let mean = sum_of_squares / samples.len() as f32;
    let rms = mean.sqrt();

    // Normalize to 0.0-1.0 range with increased sensitivity
    // Use 0.05 as practical maximum for speech to make it more responsive
    (rms / 0.05).min(1.0)
}

/// Get recent audio levels from the samples buffer
///
/// Calculates RMS amplitude for chunks of recent audio samples,
/// returning an array of amplitude values suitable for visualization.
///
/// # Arguments
/// * `samples` - Shared buffer containing all recorded audio samples
/// * `sample_rate` - Audio sample rate (typically 16000 Hz)
///
/// # Returns
/// Vector of amplitude values (0.0-1.0), most recent last
pub fn get_audio_levels(samples: Arc<Mutex<Vec<f32>>>) -> Vec<f32> {
    let samples_guard = match samples.lock() {
        Ok(guard) => guard,
        Err(_) => return vec![0.0; MAX_LEVELS], // Return silence on lock failure
    };

    let total_samples = samples_guard.len();

    // If we don't have enough samples, return partial levels with zeros
    if total_samples < SAMPLES_PER_LEVEL {
        return vec![0.0; MAX_LEVELS];
    }

    let mut levels = Vec::new();

    // Calculate how many complete chunks we can extract
    let num_chunks = (total_samples / SAMPLES_PER_LEVEL).min(MAX_LEVELS);

    // Start from the most recent samples and work backwards
    let start_index = total_samples - (num_chunks * SAMPLES_PER_LEVEL);

    for i in 0..num_chunks {
        let chunk_start = start_index + (i * SAMPLES_PER_LEVEL);
        let chunk_end = chunk_start + SAMPLES_PER_LEVEL;
        let chunk = &samples_guard[chunk_start..chunk_end];

        let rms = calculate_rms_amplitude(chunk);
        levels.push(rms);
    }

    // Pad with zeros if we don't have enough history yet
    while levels.len() < MAX_LEVELS {
        levels.insert(0, 0.0);
    }

    levels
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_rms_amplitude_silence() {
        let samples = vec![0.0; 1000];
        let rms = calculate_rms_amplitude(&samples);
        assert_eq!(rms, 0.0, "Silence should produce 0.0 amplitude");
    }

    #[test]
    fn test_calculate_rms_amplitude_full_scale() {
        // Full-scale signal (all samples at maximum)
        let samples = vec![1.0; 1000];
        let rms = calculate_rms_amplitude(&samples);
        assert_eq!(rms, 1.0, "Full-scale signal should produce 1.0 amplitude (capped)");
    }

    #[test]
    fn test_calculate_rms_amplitude_sine_wave() {
        // Simulate a sine wave at low amplitude (for sensitive detection)
        let samples: Vec<f32> = (0..1000)
            .map(|i| 0.03 * (i as f32 * 0.1).sin())
            .collect();

        let rms = calculate_rms_amplitude(&samples);

        // RMS of sine wave with amplitude 0.03 should be approximately 0.03 / sqrt(2) ≈ 0.021
        // Normalized by 0.05, that's about 0.42
        assert!(rms > 0.3 && rms < 0.6, "Sine wave RMS should be in expected range, got {}", rms);
    }

    #[test]
    fn test_calculate_rms_amplitude_empty() {
        let samples: Vec<f32> = vec![];
        let rms = calculate_rms_amplitude(&samples);
        assert_eq!(rms, 0.0, "Empty samples should produce 0.0 amplitude");
    }

    #[test]
    fn test_get_audio_levels_insufficient_samples() {
        let samples = Arc::new(Mutex::new(vec![0.5; 100]));
        let levels = get_audio_levels(samples);

        assert_eq!(levels.len(), MAX_LEVELS, "Should return MAX_LEVELS elements");
        assert!(levels.iter().all(|&l| l == 0.0), "Should be all zeros when insufficient samples");
    }

    #[test]
    fn test_get_audio_levels_full_history() {
        // Create enough samples for full history
        let total_samples = SAMPLES_PER_LEVEL * MAX_LEVELS;
        let samples = Arc::new(Mutex::new(vec![0.5; total_samples]));

        let levels = get_audio_levels(samples);

        assert_eq!(levels.len(), MAX_LEVELS, "Should return MAX_LEVELS elements");
        assert!(levels.iter().all(|&l| l > 0.0), "All levels should be non-zero");
    }

    #[test]
    fn test_get_audio_levels_partial_history() {
        // Create samples for only 5 chunks
        let total_samples = SAMPLES_PER_LEVEL * 5;
        let samples = Arc::new(Mutex::new(vec![0.5; total_samples]));

        let levels = get_audio_levels(samples);

        assert_eq!(levels.len(), MAX_LEVELS, "Should return MAX_LEVELS elements");

        let non_zero_count = levels.iter().filter(|&&l| l > 0.0).count();
        assert_eq!(non_zero_count, 5, "Should have 5 non-zero levels");

        let zero_count = levels.iter().filter(|&&l| l == 0.0).count();
        assert_eq!(zero_count, 15, "Should have 15 zero levels (padding)");
    }

    #[test]
    fn test_get_audio_levels_increasing_amplitude() {
        // Create samples with increasing amplitude
        let mut all_samples = Vec::new();

        for chunk_idx in 0..MAX_LEVELS {
            let amplitude = (chunk_idx as f32) * 0.05; // 0.0, 0.05, 0.1, ..., 0.95
            let chunk: Vec<f32> = (0..SAMPLES_PER_LEVEL)
                .map(|_| amplitude)
                .collect();
            all_samples.extend(chunk);
        }

        let samples = Arc::new(Mutex::new(all_samples));
        let levels = get_audio_levels(samples);

        // Verify levels are monotonically increasing (approximately)
        for i in 1..levels.len() {
            assert!(
                levels[i] >= levels[i - 1] - 0.01, // Allow small floating point tolerance
                "Levels should increase: levels[{}]={} < levels[{}]={}",
                i,
                levels[i],
                i - 1,
                levels[i - 1]
            );
        }
    }
}

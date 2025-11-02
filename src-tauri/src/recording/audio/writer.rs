use hound::{WavSpec, WavWriter};
use std::path::Path;

/// Write audio samples to a WAV file
///
/// Converts F32 samples to 16-bit signed integer format
/// with 44.1kHz sample rate and mono channel
pub fn write_wav_file(samples: &[f32], output_path: &Path) -> Result<(), String> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: 44100,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = WavWriter::create(output_path, spec)
        .map_err(|e| format!("Failed to create WAV file: {}", e))?;

    // Convert F32 samples to I16
    for &sample in samples {
        let amplitude = i16::MAX as f32;
        writer
            .write_sample((sample * amplitude) as i16)
            .map_err(|e| format!("Failed to write sample: {}", e))?;
    }

    writer
        .finalize()
        .map_err(|e| format!("Failed to finalize WAV file: {}", e))?;

    Ok(())
}

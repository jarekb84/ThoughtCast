use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Sample;
use std::sync::{Arc, Mutex};
use std::thread;

use crate::recording::state::SharedRecordingState;

/// Start capturing audio from the default microphone
///
/// Spawns a background thread that:
/// 1. Initializes CPAL audio input stream
/// 2. Captures audio samples to the shared buffer
/// 3. Runs until is_recording flag is set to false
pub fn start_capture(state: SharedRecordingState) -> Result<(), String> {
    let mut state_guard = state.lock().unwrap();

    if state_guard.is_recording {
        return Err("Recording is already in progress.".to_string());
    }

    // Clear previous samples
    {
        let mut samples = state_guard.samples.lock().unwrap();
        samples.clear();
    }
    state_guard.start_time = Some(chrono::Utc::now());
    state_guard.is_recording = true;

    // Clone references for the recording thread
    let samples_clone = Arc::clone(&state_guard.samples);
    let state_clone = Arc::clone(&state);

    // Spawn a thread to handle audio recording
    thread::spawn(move || {
        if let Err(e) = run_audio_capture_loop(samples_clone, state_clone) {
            eprintln!("Audio capture error: {}", e);
        }
    });

    Ok(())
}

/// Main audio capture loop running in background thread
fn run_audio_capture_loop(
    samples: Arc<Mutex<Vec<f32>>>,
    state: SharedRecordingState,
) -> Result<(), String> {
    // Get the default audio host
    let host = cpal::default_host();

    // Get the default input device
    let device = host
        .default_input_device()
        .ok_or("No microphone detected. Please check your audio settings.")?;

    // Get the default input config
    let config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {}", e))?;

    let samples_for_stream = Arc::clone(&samples);

    // Build the input stream based on sample format
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            build_input_stream::<f32>(&device, &config.into(), samples_for_stream)
        }
        cpal::SampleFormat::I16 => {
            build_input_stream::<i16>(&device, &config.into(), samples_for_stream)
        }
        cpal::SampleFormat::U16 => {
            build_input_stream::<u16>(&device, &config.into(), samples_for_stream)
        }
        _ => return Err("Unsupported sample format".to_string()),
    }?;

    stream
        .play()
        .map_err(|e| format!("Failed to start recording: {}", e))?;

    // Keep the stream alive while recording
    loop {
        thread::sleep(std::time::Duration::from_millis(100));

        // Check if we should stop
        if let Ok(state_guard) = state.lock() {
            if !state_guard.is_recording {
                break;
            }
        }
    }

    // Stream will be dropped here, stopping the recording
    Ok(())
}

/// Build a CPAL input stream for a specific sample format
///
/// Handles conversion from various sample formats (F32, I16, U16) to F32
/// and stores samples in the shared buffer
fn build_input_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    samples: Arc<Mutex<Vec<f32>>>,
) -> Result<cpal::Stream, String>
where
    T: cpal::Sample + cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    let err_fn = |err| eprintln!("An error occurred on the input stream: {}", err);

    let stream = device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                if let Ok(mut samples_guard) = samples.lock() {
                    for &sample in data {
                        // Convert sample to f32 using FromSample trait
                        let float_val = f32::from_sample(sample);
                        samples_guard.push(float_val);
                    }
                }
            },
            err_fn,
            None,
        )
        .map_err(|e| format!("Failed to build input stream: {}", e))?;

    Ok(stream)
}

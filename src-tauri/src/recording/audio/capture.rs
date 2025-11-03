use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Sample;
use std::sync::{Arc, Mutex};
use std::thread;

use crate::recording::state::{RecordingStatus, SharedRecordingState};

/// Start capturing audio from the default microphone
///
/// Spawns a background thread that:
/// 1. Initializes CPAL audio input stream
/// 2. Captures audio samples to the shared buffer when recording
/// 3. Continues running through pause/resume cycles
/// 4. Runs until status is set to Idle
pub fn start_capture(state: SharedRecordingState) -> Result<(), String> {
    let mut state_guard = state.lock().unwrap();

    if state_guard.is_active() {
        return Err("Recording is already in progress.".to_string());
    }

    // Clear previous samples
    {
        let mut samples = state_guard.samples.lock().unwrap();
        samples.clear();
    }
    state_guard.start_time = Some(chrono::Utc::now());
    state_guard.pause_start_time = None;
    state_guard.total_paused_duration_ms = 0;
    state_guard.status = RecordingStatus::Recording;

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
///
/// Continues running while status is Recording or Paused.
/// Only stops when status transitions to Idle.
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
    let state_for_stream = Arc::clone(&state);

    // Build the input stream based on sample format
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            build_input_stream::<f32>(&device, &config.into(), samples_for_stream, state_for_stream)
        }
        cpal::SampleFormat::I16 => {
            build_input_stream::<i16>(&device, &config.into(), samples_for_stream, state_for_stream)
        }
        cpal::SampleFormat::U16 => {
            build_input_stream::<u16>(&device, &config.into(), samples_for_stream, state_for_stream)
        }
        _ => return Err("Unsupported sample format".to_string()),
    }?;

    stream
        .play()
        .map_err(|e| format!("Failed to start recording: {}", e))?;

    // Keep the stream alive while recording session is active
    loop {
        thread::sleep(std::time::Duration::from_millis(100));

        // Check if we should stop
        if let Ok(state_guard) = state.lock() {
            if !state_guard.is_active() {
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
/// and stores samples in the shared buffer only when status is Recording.
/// When paused, the callback runs but samples are not collected.
fn build_input_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    samples: Arc<Mutex<Vec<f32>>>,
    state: SharedRecordingState,
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
                // Only collect samples if actively recording (not paused)
                if let Ok(state_guard) = state.lock() {
                    if state_guard.is_recording() {
                        if let Ok(mut samples_guard) = samples.lock() {
                            for &sample in data {
                                // Convert sample to f32 using FromSample trait
                                let float_val = f32::from_sample(sample);
                                samples_guard.push(float_val);
                            }
                        }
                    }
                }
            },
            err_fn,
            None,
        )
        .map_err(|e| format!("Failed to build input stream: {}", e))?;

    Ok(stream)
}

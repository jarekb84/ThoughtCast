use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Sample;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::recording::audio::capture_failure::{
    propagate_capture_failure, CaptureFailureCallback, RecordingCaptureFailedEvent,
};
use crate::recording::audio::streaming_writer::StreamingWavWriter;
use crate::recording::state::SharedRecordingState;
use crate::recording::utils::get_storage_dir;

/// Cadence at which the capture loop drains new samples from the shared buffer
/// into the in-flight WAV writer and checks exit conditions.
const CAPTURE_TICK_MS: u64 = 100;

/// Cadence at which the streaming writer flushes its RIFF/data chunk size
/// headers and publishes a fresh `flushed_through_seconds` trust signal onto
/// shared state. Choosing 2 s strikes a balance: a crash loses at most ~2 s
/// of audio that hadn't yet been reflected in the header, while header
/// rewrites stay infrequent enough to be a rounding error in disk I/O.
const HEADER_FLUSH_INTERVAL: Duration = Duration::from_secs(2);

/// Spawn the audio capture thread.
///
/// `lifecycle::start_recording` is responsible for prepping the shared state
/// (clearing samples, setting `status` to Recording, generating
/// `active_session_id`, etc.) before this is called. This function just kicks
/// off the thread.
///
/// `on_failure` fires when capture dies unexpectedly (init failure or mid-
/// stream stream error). The callback receives a `RecordingCaptureFailedEvent`
/// containing the recovered partial recording, if any.
pub fn start_capture<F>(state: SharedRecordingState, on_failure: F) -> Result<(), String>
where
    F: Fn(RecordingCaptureFailedEvent) + Send + Sync + 'static,
{
    let samples_clone = {
        let g = state.lock().map_err(|e| format!("Recording state poisoned: {}", e))?;
        Arc::clone(&g.samples)
    };
    let state_clone = Arc::clone(&state);
    let on_failure: CaptureFailureCallback = Arc::new(on_failure);

    thread::spawn(move || {
        if let Err(e) = run_audio_capture_loop(samples_clone, state_clone.clone(), &on_failure) {
            // Init-time failure (device unavailable, stream build error, etc.).
            // Route through the same partial-save / event-emit path mid-stream
            // failures use; from here the state reset + frontend warning are
            // identical.
            propagate_capture_failure(&state_clone, e, &on_failure);
        }
    });

    Ok(())
}

/// Main audio capture loop running in background thread.
///
/// Returns `Err` for init failures (device missing, stream build failed).
/// Returns `Ok(())` after a clean shutdown OR after handling a mid-stream
/// failure (which is signalled via `state.capture_error` from the cpal
/// `err_fn` callback) — in the mid-stream case the partial-save event is
/// fired before returning, so the caller doesn't need to do anything.
fn run_audio_capture_loop(
    samples: Arc<Mutex<Vec<f32>>>,
    state: SharedRecordingState,
    on_failure: &CaptureFailureCallback,
) -> Result<(), String> {
    // Get the default audio host
    let host = cpal::default_host();

    // Get the default input device
    let device = host
        .default_input_device()
        .ok_or(
            "No microphone access. Please grant microphone permission in \
             System Settings → Privacy & Security → Microphone → ThoughtCast"
        )?;

    // Get the default input config
    let config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {}", e))?;

    // Publish the device's sample rate so the WAV writer can label the file
    // accurately. Without this, samples captured at the device's native rate
    // (often 48 kHz) get labelled 44.1 kHz, time-stretching playback and
    // pushing the audio's apparent tail past whatever duration the chunked
    // transcription planner uses — meaning the last ~9% of the recording
    // never gets transcribed.
    let device_sample_rate = config.sample_rate().0;
    if let Ok(mut state_guard) = state.lock() {
        state_guard.capture.sample_rate = Some(device_sample_rate);
    }

    // Create the streaming writer that gives this recording on-disk presence
    // from the first 100 ms onwards. The path is `audio/.in-flight/<id>.wav`;
    // `lifecycle::stop_recording` later renames it to `audio/<id>.wav` after
    // the writer is finalized.
    let in_flight_path = build_in_flight_path(&state)?;
    let mut writer = StreamingWavWriter::create(&in_flight_path, device_sample_rate)?;
    if let Ok(mut state_guard) = state.lock() {
        state_guard.capture.in_flight_audio_path = Some(in_flight_path.clone());
        state_guard.capture.flushed_through_seconds = Some(0.0);
    }

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

    // Streaming-write state local to this thread. `sample_cursor` is the
    // index up to which we have flushed the in-memory `samples` buffer to
    // disk; anything past it is new audio waiting to be written.
    let mut sample_cursor: usize = 0;
    let mut last_header_flush = Instant::now();
    let mut mid_stream_failure: Option<String> = None;

    loop {
        thread::sleep(Duration::from_millis(CAPTURE_TICK_MS));

        // Drain whatever the cpal callback has accumulated since the last
        // tick into the in-flight WAV.
        flush_new_samples_to_disk(&samples, &mut sample_cursor, &mut writer);

        // Periodically commit a fresh header so a crash leaves a readable
        // WAV, and publish the durably-saved duration as the UI trust signal.
        if last_header_flush.elapsed() >= HEADER_FLUSH_INTERVAL {
            if let Err(e) = writer.flush_headers() {
                log::warn!("Streaming WAV header flush failed (continuing): {}", e);
            }
            let durable_seconds = writer.duration_seconds();
            if let Ok(mut state_guard) = state.lock() {
                state_guard.capture.flushed_through_seconds = Some(durable_seconds);
            }
            last_header_flush = Instant::now();
        }

        // Exit conditions:
        //   1. Mid-stream failure signalled by err_fn populating
        //      `state.capture.capture_error`. Drain it and fall through to the
        //      partial-save path.
        //   2. Normal shutdown: status transitioned to Processing/Idle by
        //      stop/cancel/external action.
        if let Ok(mut state_guard) = state.lock() {
            if let Some(reason) = state_guard.capture.capture_error.take() {
                mid_stream_failure = Some(reason);
                break;
            }
            if !state_guard.is_active() {
                break;
            }
        }
    }

    // Stop the audio stream BEFORE finalizing the writer so the cpal callback
    // can't push more samples past the cursor while we're closing.
    drop(stream);

    // Final flush of anything captured between the last tick and stop.
    flush_new_samples_to_disk(&samples, &mut sample_cursor, &mut writer);

    let final_duration = writer.duration_seconds();
    if let Err(e) = writer.finalize() {
        log::warn!("Streaming WAV finalize failed (file likely still readable via header repair): {}", e);
    }
    if let Ok(mut state_guard) = state.lock() {
        state_guard.capture.flushed_through_seconds = Some(final_duration);
    }

    if let Some(reason) = mid_stream_failure {
        propagate_capture_failure(&state, reason, on_failure);
    }

    Ok(())
}

/// Snapshot newly-captured samples into the streaming writer. The cursor is
/// advanced by the snapshot length even when the write fails — repeating
/// failed bytes would only repeat the failure, and the in-memory `samples`
/// buffer remains the audio of record for `get_audio_levels`.
fn flush_new_samples_to_disk(
    samples: &Arc<Mutex<Vec<f32>>>,
    cursor: &mut usize,
    writer: &mut StreamingWavWriter,
) {
    let new_samples: Vec<f32> = {
        let Ok(samples_guard) = samples.lock() else {
            return;
        };
        if samples_guard.len() <= *cursor {
            return;
        }
        samples_guard[*cursor..].to_vec()
    };
    *cursor += new_samples.len();
    if let Err(e) = writer.append_f32_samples(&new_samples) {
        log::warn!("Streaming WAV append failed (continuing): {}", e);
    }
}

/// Resolve the in-flight WAV path from `state.active_session_id`, creating
/// the parent directory if needed. The path lives under `audio/.in-flight/`
/// so completed sessions (which live in `audio/`) and recoverable ones stay
/// visibly separated on disk.
fn build_in_flight_path(state: &SharedRecordingState) -> Result<PathBuf, String> {
    let id = state
        .lock()
        .map_err(|e| format!("Recording state poisoned: {}", e))?
        .active_session_id
        .clone()
        .ok_or_else(|| {
            "active_session_id was not set before capture started — \
             call lifecycle::start_recording, not start_capture directly"
                .to_string()
        })?;
    let storage_dir = get_storage_dir()?;
    Ok(storage_dir
        .join("audio")
        .join(".in-flight")
        .join(format!("{}.wav", id)))
}

/// Build a CPAL input stream for a specific sample format.
///
/// Handles conversion from various sample formats (F32, I16, U16) to F32
/// and stores samples in the shared buffer only when status is Recording.
/// When paused, the callback runs but samples are not collected.
///
/// The CPAL error callback writes any stream error into `state.capture_error`
/// rather than just `eprintln!`'ing — the capture loop polls that field and
/// triggers the partial-save / event-emit path when it sees a value.
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
    let state_for_err = Arc::clone(&state);
    let err_fn = move |err: cpal::StreamError| {
        let reason = format!("Audio stream error: {}", err);
        // Don't overwrite a previously-recorded error — the capture loop
        // will pick up the first one and tear down. Subsequent errors from
        // the same dying stream are noise.
        if let Ok(mut state_guard) = state_for_err.lock() {
            if state_guard.capture.capture_error.is_none() {
                state_guard.capture.capture_error = Some(reason);
            }
        }
    };

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

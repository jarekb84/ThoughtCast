use hound::{WavSpec, WavWriter};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub timestamp: String,
    pub audio_path: String,
    pub duration: f64,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionIndex {
    pub sessions: Vec<Session>,
}

pub struct RecordingState {
    pub is_recording: bool,
    pub samples: Arc<Mutex<Vec<f32>>>,
    pub start_time: Option<DateTime<Utc>>,
}

impl RecordingState {
    pub fn new() -> Self {
        RecordingState {
            is_recording: false,
            samples: Arc::new(Mutex::new(Vec::new())),
            start_time: None,
        }
    }
}

pub type SharedRecordingState = Arc<Mutex<RecordingState>>;

pub fn get_storage_dir() -> Result<PathBuf, String> {
    // Use Documents folder for user-generated content (recordings)
    // This follows the pattern of voice memo apps and makes files easily accessible
    let documents_dir = dirs::document_dir().ok_or("Could not find documents directory")?;
    let storage_dir = documents_dir.join("ThoughtCast");

    // Create directories if they don't exist
    fs::create_dir_all(&storage_dir).map_err(|e| format!("Failed to create storage directory: {}", e))?;
    fs::create_dir_all(storage_dir.join("audio")).map_err(|e| format!("Failed to create audio directory: {}", e))?;

    Ok(storage_dir)
}

pub fn load_sessions() -> Result<SessionIndex, String> {
    let storage_dir = get_storage_dir()?;
    let sessions_file = storage_dir.join("sessions.json");

    if !sessions_file.exists() {
        // Create empty sessions file
        let index = SessionIndex { sessions: Vec::new() };
        save_sessions(&index)?;
        return Ok(index);
    }

    let content = fs::read_to_string(&sessions_file)
        .map_err(|e| format!("Failed to read sessions file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse sessions file: {}", e))
}

pub fn save_sessions(index: &SessionIndex) -> Result<(), String> {
    let storage_dir = get_storage_dir()?;
    let sessions_file = storage_dir.join("sessions.json");

    let content = serde_json::to_string_pretty(index)
        .map_err(|e| format!("Failed to serialize sessions: {}", e))?;

    fs::write(&sessions_file, content)
        .map_err(|e| format!("Failed to write sessions file: {}", e))
}

pub fn start_recording(state: SharedRecordingState) -> Result<(), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let mut state_guard = state.lock().unwrap();

    if state_guard.is_recording {
        return Err("Already recording".to_string());
    }

    // Clear previous samples
    {
        let mut samples = state_guard.samples.lock().unwrap();
        samples.clear();
    }
    state_guard.start_time = Some(Utc::now());
    state_guard.is_recording = true;

    // Clone references for the recording thread
    let samples_clone = Arc::clone(&state_guard.samples);
    let state_clone = Arc::clone(&state);

    // Spawn a thread to handle audio recording
    thread::spawn(move || {
        // Get the default audio host
        let host = cpal::default_host();

        // Get the default input device
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                eprintln!("No input device available");
                return;
            }
        };

        // Get the default input config
        let config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to get default input config: {}", e);
                return;
            }
        };

        let samples_for_stream = Arc::clone(&samples_clone);

        // Build the input stream
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => build_input_stream::<f32>(&device, &config.into(), samples_for_stream),
            cpal::SampleFormat::I16 => build_input_stream::<i16>(&device, &config.into(), samples_for_stream),
            cpal::SampleFormat::U16 => build_input_stream::<u16>(&device, &config.into(), samples_for_stream),
            _ => {
                eprintln!("Unsupported sample format");
                return;
            }
        };

        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to build stream: {}", e);
                return;
            }
        };

        if let Err(e) = stream.play() {
            eprintln!("Failed to start recording: {}", e);
            return;
        }

        // Keep the stream alive while recording
        loop {
            thread::sleep(std::time::Duration::from_millis(100));

            // Check if we should stop
            if let Ok(state_guard) = state_clone.lock() {
                if !state_guard.is_recording {
                    break;
                }
            }
        }

        // Stream will be dropped here, stopping the recording
    });

    Ok(())
}

fn build_input_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    samples: Arc<Mutex<Vec<f32>>>,
) -> Result<cpal::Stream, String>
where
    T: cpal::Sample + cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    use cpal::traits::DeviceTrait;
    use cpal::Sample;

    let err_fn = |err| eprintln!("An error occurred on the input stream: {}", err);

    let stream = device.build_input_stream(
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
    ).map_err(|e| format!("Failed to build input stream: {}", e))?;

    Ok(stream)
}

pub fn stop_recording(state: SharedRecordingState) -> Result<Session, String> {
    let mut state_guard = state.lock().unwrap();

    if !state_guard.is_recording {
        return Err("Not recording".to_string());
    }

    // Mark as not recording (this will stop the recording thread)
    state_guard.is_recording = false;

    // Calculate duration
    let duration = if let Some(start_time) = state_guard.start_time {
        let end_time = Utc::now();
        (end_time - start_time).num_milliseconds() as f64 / 1000.0
    } else {
        0.0
    };

    // Wait a bit for the recording thread to finish collecting samples
    drop(state_guard);
    thread::sleep(std::time::Duration::from_millis(200));
    let state_guard = state.lock().unwrap();

    // Generate timestamp-based ID
    let timestamp = Utc::now();
    let id = timestamp.format("%Y-%m-%d_%H-%M-%S").to_string();

    // Save audio file
    let storage_dir = get_storage_dir()?;
    let audio_filename = format!("{}.wav", id);
    let audio_path = storage_dir.join("audio").join(&audio_filename);

    // Write WAV file
    let spec = WavSpec {
        channels: 1,
        sample_rate: 44100,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let writer = WavWriter::create(&audio_path, spec)
        .map_err(|e| format!("Failed to create WAV file: {}", e))?;

    let mut writer = writer;

    // Copy samples from state
    let samples = state_guard.samples.lock().unwrap();
    for &sample in samples.iter() {
        let amplitude = i16::MAX as f32;
        writer.write_sample((sample * amplitude) as i16)
            .map_err(|e| format!("Failed to write sample: {}", e))?;
    }
    drop(samples);

    writer.finalize()
        .map_err(|e| format!("Failed to finalize WAV file: {}", e))?;

    // Create session
    let session = Session {
        id: id.clone(),
        timestamp: timestamp.to_rfc3339(),
        audio_path: format!("audio/{}", audio_filename),
        duration,
        preview: "Audio recording".to_string(),
    };

    // Load existing sessions
    let mut index = load_sessions()?;

    // Add new session at the beginning (most recent first)
    index.sessions.insert(0, session.clone());

    // Save updated sessions
    save_sessions(&index)?;

    Ok(session)
}

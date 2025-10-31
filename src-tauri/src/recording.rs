use hound::{WavSpec, WavWriter};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::process::Command;
use std::time::Duration;
use chrono::{DateTime, Utc};
use arboard::Clipboard;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub timestamp: String,
    pub audio_path: String,
    pub duration: f64,
    pub preview: String,
    #[serde(default)]
    pub transcript_path: String,
    #[serde(default)]
    pub clipboard_copied: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionIndex {
    pub sessions: Vec<Session>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperConfig {
    #[serde(rename = "whisperPath")]
    pub whisper_path: String,
    #[serde(rename = "modelPath")]
    pub model_path: String,
    #[serde(rename = "voiceNotesDir")]
    pub voice_notes_dir: Option<String>,
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
    fs::create_dir_all(storage_dir.join("text")).map_err(|e| format!("Failed to create text directory: {}", e))?;

    Ok(storage_dir)
}

/// Copy text to system clipboard
pub fn copy_to_clipboard(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;

    clipboard.set_text(text)
        .map_err(|e| format!("Failed to copy to clipboard: {}", e))?;

    Ok(())
}

pub fn load_config() -> Result<WhisperConfig, String> {
    let storage_dir = get_storage_dir()?;
    let config_file = storage_dir.join("config.json");

    if !config_file.exists() {
        return Err(format!(
            "Whisper.cpp is not set up. Please create config.json at: {}\n\
            See README for setup instructions.\n\
            Example content:\n\
            {{\n\
              \"whisperPath\": \"C:\\\\whisper\\\\whisper.exe\",\n\
              \"modelPath\": \"C:\\\\whisper\\\\models\\\\ggml-base.bin\"\n\
            }}",
            config_file.display()
        ));
    }

    let content = fs::read_to_string(&config_file)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config file: {}", e))
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
        return Err("Recording is already in progress.".to_string());
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
                eprintln!("No microphone detected. Please check your audio settings.");
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

fn transcribe_audio(audio_path: &Path, id: &str) -> Result<(String, String), String> {
    // Load config
    let config = load_config()?;

    // Verify Whisper executable exists
    let whisper_path = Path::new(&config.whisper_path);
    if !whisper_path.exists() {
        return Err("Whisper.cpp is not set up. Please see the README for setup instructions.".to_string());
    }

    // Verify model exists
    let model_path = Path::new(&config.model_path);
    if !model_path.exists() {
        return Err("Whisper model file is missing. Please download a model - see README.".to_string());
    }

    // Run Whisper.cpp with -otxt flag to generate transcript file
    // Whisper will create a file named {audio_path}.txt
    let output = Command::new(&config.whisper_path)
        .arg("-m")
        .arg(&config.model_path)
        .arg("-f")
        .arg(audio_path)
        .arg("-otxt")
        .output()
        .map_err(|_| "Transcription service couldn't start. Check your Whisper.cpp installation.".to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Whisper transcription failed: {}", stderr));
    }

    // Wait a moment for file to be written
    thread::sleep(Duration::from_millis(500));

    // Read the generated transcript file
    // Whisper creates the file at {audio_path}.txt
    let whisper_output_path = audio_path.with_extension("wav.txt");

    if !whisper_output_path.exists() {
        return Err(format!("Whisper did not create transcript file at: {}", whisper_output_path.display()));
    }

    let raw_transcript = fs::read_to_string(&whisper_output_path)
        .map_err(|e| format!("Failed to read transcript file: {}", e))?;

    // Clean transcript: remove timestamp lines like [00:00:00.000 --> 00:00:02.000]
    let cleaned_transcript = raw_transcript
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            // Filter out timestamp lines
            !trimmed.starts_with('[') || !trimmed.contains("-->")
        })
        .collect::<Vec<&str>>()
        .join("\n")
        .trim()
        .to_string();

    // Save cleaned transcript to text/ folder
    let storage_dir = get_storage_dir()?;
    let transcript_filename = format!("{}.txt", id);
    let transcript_path = storage_dir.join("text").join(&transcript_filename);

    fs::write(&transcript_path, &cleaned_transcript)
        .map_err(|e| format!("Failed to write cleaned transcript: {}", e))?;

    // Delete the temporary Whisper output file
    let _ = fs::remove_file(whisper_output_path);

    // Return relative path and full transcript
    Ok((format!("text/{}", transcript_filename), cleaned_transcript))
}

pub fn stop_recording(state: SharedRecordingState) -> Result<Session, String> {
    let mut state_guard = state.lock().unwrap();

    if !state_guard.is_recording {
        return Err("No active recording to stop.".to_string());
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

    // Attempt transcription
    let (transcript_path, preview, clipboard_copied) = match transcribe_audio(&audio_path, &id) {
        Ok((path, text)) => {
            // Generate preview from transcript
            let preview = if text.len() > 100 {
                format!("{}...", &text[..100])
            } else if text.is_empty() {
                "No transcript".to_string()
            } else {
                text.clone()
            };

            // Attempt automatic clipboard copy
            let clipboard_copied = if !text.is_empty() {
                match copy_to_clipboard(&text) {
                    Ok(_) => {
                        println!("Transcript copied to clipboard");
                        true
                    }
                    Err(e) => {
                        eprintln!("Failed to copy to clipboard: {}", e);
                        false
                    }
                }
            } else {
                false
            };

            (path, preview, clipboard_copied)
        },
        Err(e) => {
            // Log error but don't fail the recording
            eprintln!("Transcription failed: {}", e);
            (String::new(), format!("Transcription failed: {}", e), false)
        }
    };

    // Create session
    let session = Session {
        id: id.clone(),
        timestamp: timestamp.to_rfc3339(),
        audio_path: format!("audio/{}", audio_filename),
        duration,
        preview,
        transcript_path,
        clipboard_copied,
    };

    // Load existing sessions
    let mut index = load_sessions()?;

    // Add new session at the beginning (most recent first)
    index.sessions.insert(0, session.clone());

    // Save updated sessions
    save_sessions(&index)?;

    Ok(session)
}

/// Load transcript text from file on demand
pub fn load_transcript(session_id: &str) -> Result<String, String> {
    let storage_dir = get_storage_dir()?;
    let transcript_path = storage_dir.join("text").join(format!("{}.txt", session_id));

    if !transcript_path.exists() {
        return Err(format!("Transcript file not found: {}", transcript_path.display()));
    }

    fs::read_to_string(&transcript_path)
        .map_err(|e| format!("Failed to read transcript file: {}", e))
}

/// Re-transcribe an existing audio session
/// This will overwrite any existing transcript for this session
pub fn retranscribe_session(session_id: &str) -> Result<String, String> {
    let storage_dir = get_storage_dir()?;

    // Load sessions to find the audio file
    let mut index = load_sessions()?;

    // Find the session
    let session = index.sessions.iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    // Get the full path to the audio file
    let audio_path = storage_dir.join(&session.audio_path);

    if !audio_path.exists() {
        return Err(format!("Audio file not found: {}", audio_path.display()));
    }

    // Run transcription
    let (transcript_path, transcript_text) = transcribe_audio(&audio_path, session_id)?;

    // Update session with new transcript info
    session.transcript_path = transcript_path;

    // Update preview
    session.preview = if transcript_text.len() > 100 {
        format!("{}...", &transcript_text[..100])
    } else if transcript_text.is_empty() {
        "No transcript".to_string()
    } else {
        transcript_text.clone()
    };

    // Save updated sessions
    save_sessions(&index)?;

    Ok(transcript_text)
}

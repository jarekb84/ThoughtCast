use rodio::{Decoder, OutputStream, Sink};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

/// Plays an audio file synchronously, blocking until playback completes.
///
/// Used for the start cue, which must finish *before* microphone capture
/// begins so the cue never bleeds into the recorded waveform (PRD edge case 5).
///
/// Returns an error if the output stream can't be opened (no audio device) or
/// the file can't be decoded. Callers should treat playback errors as
/// non-fatal — cues are advisory, not part of the recording contract.
pub fn play_cue_blocking(path: &Path, volume: f32) -> Result<(), String> {
    let (_stream, stream_handle) = OutputStream::try_default()
        .map_err(|e| format!("No audio output device available: {}", e))?;

    let file = File::open(path)
        .map_err(|e| format!("Failed to open cue file {:?}: {}", path, e))?;
    let source = Decoder::new(BufReader::new(file))
        .map_err(|e| format!("Failed to decode cue file {:?}: {}", path, e))?;

    let sink = Sink::try_new(&stream_handle)
        .map_err(|e| format!("Failed to create audio sink: {}", e))?;
    sink.set_volume(volume.clamp(0.0, 1.0));
    sink.append(source);
    sink.sleep_until_end();
    Ok(())
}

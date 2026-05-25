use crate::recording::audio::read_wav_duration_seconds;
use crate::recording::models::{AppConfig, Session, PROCESSING_PREVIEW};
use crate::recording::session::transcription_orchestration::{
    run_transcription_route, ChunkProgressEvent, TranscriptionResult,
};
use crate::recording::state::SharedRecordingState;
use crate::recording::transcription::decode_to_wav;
use crate::recording::utils::get_storage_dir;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

/// Mark a session as "in-flight" for re-transcription and return the updated
/// session row.
///
/// This is the synchronous half of the retranscribe workflow — the caller is
/// expected to hand the returned session to the frontend immediately and then
/// kick off `orchestrate_async_retranscription` to actually run Whisper on a
/// background thread. Mirrors the `stop_recording` → `orchestrate_async_transcription`
/// pattern so the UI's existing "Processing..." view can light up without any
/// new frontend plumbing.
pub fn start_retranscription(session_id: &str) -> Result<Session, String> {
    use crate::recording::session::storage::{load_sessions, save_sessions};

    let storage_dir = get_storage_dir()?;
    let mut index = load_sessions()?;

    let session = index
        .sessions
        .iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let audio_path = storage_dir.join(&session.audio_path);
    if !audio_path.exists() {
        return Err(format!("Audio file not found: {}", audio_path.display()));
    }

    // The literal "Processing..." preview is what the SessionViewer keys off
    // to render the spinner + estimated-time UI (see
    // `determineTranscriptionState` on the frontend). Reusing the same marker
    // means retranscribe gets the existing transcribing view for free.
    session.preview = PROCESSING_PREVIEW.to_string();
    let updated = session.clone();

    save_sessions(&index)?;
    Ok(updated)
}

/// Orchestrate async re-transcription in a background thread.
///
/// Mirrors `orchestrate_async_transcription`: spawns a worker, runs the
/// retranscription pipeline, and emits the same `TranscriptionResult` events
/// the initial-recording flow uses so the UI listeners already wired up in
/// `useRecordingWorkflow` light up without any frontend-side changes.
///
/// Skips post-transcription compression — the session's source audio was
/// already compressed (or never qualified), and re-compressing on every
/// retranscribe would waste CPU and re-encode m4a → m4a.
pub fn orchestrate_async_retranscription<F>(
    state: SharedRecordingState,
    session_id: String,
    event_emitter: F,
) where
    F: Fn(TranscriptionResult) + Send + Sync + 'static,
{
    if let Ok(mut state_guard) = state.lock() {
        state_guard.transcribing_session_ids.insert(session_id.clone());
    }

    thread::spawn(move || {
        let emitter = Arc::new(event_emitter);
        let progress_session_id = session_id.clone();
        let progress_emitter = Arc::clone(&emitter);
        let progress_fn = move |current: u32, total: u32| {
            progress_emitter(TranscriptionResult::Progress(ChunkProgressEvent {
                session_id: progress_session_id.clone(),
                current,
                total,
            }));
        };

        let result = process_retranscription_async(session_id.clone(), &progress_fn);

        if let Ok(mut state_guard) = state.lock() {
            state_guard.transcribing_session_ids.remove(&session_id);
        }

        match result {
            Ok(session) => emitter(TranscriptionResult::Success(session)),
            Err(error) => emitter(TranscriptionResult::Error { session_id, error }),
        }
    });
}

/// Run the actual retranscription work: decode source audio if needed,
/// transcribe, sync the session row's duration to the audio file's true
/// playback duration, and persist the updated session.
fn process_retranscription_async(
    session_id: String,
    on_progress: &(dyn Fn(u32, u32) + Sync),
) -> Result<Session, String> {
    use crate::recording::session::storage::{load_sessions, save_sessions};

    let storage_dir = get_storage_dir()?;
    let mut index = load_sessions()?;
    let session = index
        .sessions
        .iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let audio_path = storage_dir.join(&session.audio_path);
    if !audio_path.exists() {
        return Err(format!("Audio file not found: {}", audio_path.display()));
    }

    let session_wall_clock_duration = session.duration;
    let config = crate::recording::load_config().ok();

    let (transcription_input, temp_wav_to_cleanup) =
        prepare_retranscribe_input(&audio_path, &session_id, config.as_ref())?;

    // Drive chunking off the audio file's actual apparent duration. For
    // pre-fix recordings the WAV/M4A header was labelled 44.1 kHz while
    // CPAL captured at 48 kHz — making playback ~8.8% longer than
    // `session.duration`. Using the file's own timeline ensures the planner
    // covers every second of audio that ffmpeg will actually slice.
    let chunking_duration =
        chunking_duration_for(&transcription_input, session_wall_clock_duration);

    let transcription_start = Instant::now();
    let (transcript_path, preview, clipboard_copied, chunking_telemetry) = run_transcription_route(
        &transcription_input,
        &session_id,
        chunking_duration,
        config.as_ref(),
        on_progress,
    );
    let transcription_elapsed = transcription_start.elapsed().as_secs_f64();

    if let Some(temp) = temp_wav_to_cleanup {
        let _ = std::fs::remove_file(&temp);
    }

    if transcript_path.is_empty() {
        return Err(preview);
    }

    let model_path = config.as_ref().map(|c| c.model_path.clone());

    session.transcript_path = transcript_path.clone();
    session.preview = preview;
    session.clipboard_copied = clipboard_copied;

    // Reconcile session.duration with the audio's actual playback length.
    // Pre-fix recordings were stored with the wall-clock duration even though
    // their WAV/M4A headers report a stretched timeline; without this update
    // the UI keeps showing "17:21" for an 18:53 file forever.
    if (chunking_duration - session_wall_clock_duration).abs() > 0.5 {
        session.duration = chunking_duration;
    }

    if session_wall_clock_duration > 0.0 {
        session.transcription_time_seconds = Some(transcription_elapsed);
        session.model_path = model_path;
    }
    if let Some(telemetry) = chunking_telemetry {
        session.chunking_analysis_seconds = Some(telemetry.analysis_seconds);
        session.chunk_count = Some(telemetry.chunk_count);
        session.chunking_used_fallback = Some(telemetry.used_fallback);
    }

    let updated = session.clone();
    save_sessions(&index)?;
    Ok(updated)
}

/// Resolve the WAV path to feed into the transcription route.
///
/// Returns `(input_for_whisper, optional_temp_to_clean_up)`. The second slot
/// is `Some(path)` only when we created a temp WAV by decoding a compressed
/// source, so the caller can remove it after transcription completes.
///
/// Failure here is fatal for the retranscribe — without WAV input the
/// whisper.cpp call would fail anyway, and a meaningful FFmpeg error is far
/// more diagnosable than the generic whisper failure that would follow.
fn prepare_retranscribe_input(
    audio_path: &Path,
    session_id: &str,
    config: Option<&AppConfig>,
) -> Result<(PathBuf, Option<PathBuf>), String> {
    if is_wav_path(audio_path) {
        return Ok((audio_path.to_path_buf(), None));
    }

    let cfg = config.ok_or_else(|| {
        "Cannot retranscribe compressed audio: app config could not be loaded \
         (FFmpeg path is required to decode .m4a back to .wav)"
            .to_string()
    })?;

    let temp_wav = derive_retranscribe_temp_path(audio_path, session_id);
    decode_to_wav(&cfg.ffmpeg_path, audio_path, &temp_wav)?;
    Ok((temp_wav.clone(), Some(temp_wav)))
}

/// True if `p` looks like a WAV file by extension. Whisper.cpp only accepts
/// WAV, so anything else needs a decode step.
fn is_wav_path(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("wav"))
        .unwrap_or(false)
}

/// Co-locate the decoded WAV next to the compressed source so the chunk
/// pipeline's per-chunk writes stay on the same volume (the chunked
/// orchestrator does the same trick for its own workspace). The leading dot
/// hides it from casual `ls`; the session id keeps concurrent retranscribes
/// from colliding on the same path.
fn derive_retranscribe_temp_path(audio_path: &Path, session_id: &str) -> PathBuf {
    let parent = audio_path.parent().unwrap_or_else(|| Path::new("."));
    parent.join(format!(".retranscribe-{}.wav", session_id))
}

/// Pick the duration to feed into the chunking planner: the WAV's own
/// apparent duration if we can read it, otherwise the session's wall-clock
/// duration. Reading the header should never fail for a file we just
/// produced (passthrough WAV or freshly-decoded temp), but the fallback
/// keeps retranscribe from breaking if it does.
fn chunking_duration_for(wav_path: &Path, session_duration: f64) -> f64 {
    match read_wav_duration_seconds(wav_path) {
        Ok(d) if d > 0.0 => d,
        Ok(_) => session_duration,
        Err(e) => {
            log::warn!(
                "Could not read WAV duration for {} ({}); falling back to session.duration={}",
                wav_path.display(),
                e,
                session_duration
            );
            session_duration
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_wav_path_accepts_lowercase_wav() {
        assert!(is_wav_path(Path::new("/x/y/recording.wav")));
    }

    #[test]
    fn test_is_wav_path_accepts_mixed_case_wav() {
        assert!(is_wav_path(Path::new("/x/y/recording.WAV")));
        assert!(is_wav_path(Path::new("/x/y/recording.Wav")));
    }

    #[test]
    fn test_is_wav_path_rejects_m4a() {
        assert!(!is_wav_path(Path::new("/x/y/recording.m4a")));
    }

    #[test]
    fn test_is_wav_path_rejects_mp3_and_extensionless() {
        assert!(!is_wav_path(Path::new("/x/y/recording.mp3")));
        assert!(!is_wav_path(Path::new("/x/y/recording")));
    }

    #[test]
    fn test_derive_retranscribe_temp_path_uses_session_id_and_sibling_dir() {
        let audio = Path::new("/data/audio/2026-05-14_20-06-16.m4a");
        let temp = derive_retranscribe_temp_path(audio, "2026-05-14_20-06-16");
        // Compare path components rather than full string so the test is
        // platform-agnostic (Windows uses `\` separators).
        assert_eq!(temp.parent(), audio.parent());
        assert_eq!(
            temp.file_name().and_then(|s| s.to_str()),
            Some(".retranscribe-2026-05-14_20-06-16.wav")
        );
    }

    #[test]
    fn test_derive_retranscribe_temp_path_falls_back_to_cwd_when_no_parent() {
        let audio = Path::new("recording.m4a");
        let temp = derive_retranscribe_temp_path(audio, "abc");
        let s = temp.to_string_lossy();
        assert!(s.contains(".retranscribe-abc.wav"), "got: {}", s);
    }

    #[test]
    fn test_prepare_retranscribe_input_passes_wav_through_without_temp() {
        let audio = Path::new("/data/audio/2026-05-14_20-06-16.wav");
        let (input, temp) = prepare_retranscribe_input(audio, "2026-05-14_20-06-16", None)
            .expect("WAV passthrough should not require config");
        assert_eq!(input, audio);
        assert!(temp.is_none(), "no temp file should be created for WAV input");
    }

    #[test]
    fn test_chunking_duration_for_falls_back_to_session_when_wav_missing() {
        let missing = Path::new("/nope/does/not/exist.wav");
        let duration = chunking_duration_for(missing, 123.4);
        assert_eq!(duration, 123.4);
    }

    #[test]
    fn test_chunking_duration_for_uses_wav_duration_when_readable() {
        use crate::recording::audio::write_wav_file;

        let mut path = std::env::temp_dir();
        path.push(format!(
            "thoughtcast_retranscribe_test_{}.wav",
            std::process::id()
        ));

        // 1 second of silence at 48 kHz — apparent duration should be 1.0s.
        let samples = vec![0.0f32; 48_000];
        write_wav_file(&samples, &path, 48_000).expect("write should succeed");

        // session.duration intentionally wrong (mimics pre-fix mislabelling).
        let duration = chunking_duration_for(&path, 0.918);
        assert!(
            (duration - 1.0).abs() < 0.001,
            "expected ~1.0s from WAV header, got {}",
            duration
        );

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_prepare_retranscribe_input_requires_config_for_non_wav() {
        let audio = Path::new("/data/audio/2026-05-14_20-06-16.m4a");
        let err = prepare_retranscribe_input(audio, "2026-05-14_20-06-16", None)
            .expect_err("non-WAV without config should fail");
        assert!(
            err.contains("FFmpeg path is required"),
            "error should explain ffmpeg requirement, got: {}",
            err
        );
    }
}

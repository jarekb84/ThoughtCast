//! Whisper.cpp engine: runs the external `whisper-cli` binary on one WAV file
//! and returns the cleaned transcript text, with the accuracy options from
//! `config.transcription` that the installed binary supports.

use crate::recording::models::AppConfig;
use crate::recording::transcription::cli_capabilities::{whisper_capabilities, WhisperCapabilities};
use crate::recording::transcription::cli_runner::run_to_text;
use crate::recording::utils::apply_no_console_window;
use std::path::Path;
use std::process::Command;

/// Silero VAD tuning. whisper.cpp's defaults (100 ms minimum silence, 30 ms
/// padding) clip the starts and ends of quietly spoken words; these keep
/// pauses inside a sentence and pad each speech region generously, while
/// still skipping the long silences where Whisper hallucinates.
const VAD_MIN_SILENCE_MS: &str = "2000";
const VAD_SPEECH_PAD_MS: &str = "400";

/// One whisper-cli run's decoding choices; the engine picks these per attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WhisperPass {
    pub context: ContextMode,
    /// Use voice activity detection if a VAD model is configured and the
    /// binary supports it.
    pub vad: bool,
}

/// How much previously decoded text Whisper may use as context.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContextMode {
    /// Whisper's default: each 30 s window is conditioned on earlier text.
    /// Best accuracy, but a hallucinated phrase can feed on itself.
    Carry,
    /// `--max-context 0`: no carried text, which breaks repetition loops.
    Fresh,
}

/// Flags derived from config + binary capabilities, kept as plain data so the
/// command construction is testable without a whisper binary.
#[derive(Debug, Clone, PartialEq, Eq)]
struct WhisperOptions {
    vad_model: Option<String>,
    prompt: Option<String>,
    carry_prompt: bool,
    context: ContextMode,
}

/// Transcribe one audio file with whisper-cli.
pub fn transcribe(audio_path: &Path, config: &AppConfig, pass: WhisperPass) -> Result<String, String> {
    validate_whisper_setup(config)?;
    let caps = whisper_capabilities(&config.whisper_path);
    let options = resolve_options(config, caps, pass);
    let cmd = build_whisper_command(&config.whisper_path, &config.model_path, audio_path, &options);
    run_to_text(cmd, audio_path, "Whisper")
}

/// Validate that Whisper.cpp and model files exist
fn validate_whisper_setup(config: &AppConfig) -> Result<(), String> {
    if !Path::new(&config.whisper_path).exists() {
        return Err(
            "Whisper.cpp is not set up. Please see the README for setup instructions.".to_string(),
        );
    }
    if !Path::new(&config.model_path).exists() {
        return Err(
            "Whisper model file is missing. Please download a model - see README.".to_string(),
        );
    }
    Ok(())
}

/// Whether a VAD pass is possible at all: a model is configured, exists, and
/// the binary supports `--vad`. Logs why not, once per call.
pub fn vad_available(config: &AppConfig) -> bool {
    vad_model_for(config, whisper_capabilities(&config.whisper_path)).is_some()
}

fn vad_model_for(config: &AppConfig, caps: WhisperCapabilities) -> Option<String> {
    let vad_path = config.transcription.vad_model_path.trim();
    if vad_path.is_empty() {
        None
    } else if !caps.vad {
        log::warn!("VAD model configured but this whisper-cli has no --vad support; upgrade whisper.cpp to 1.7.6+");
        None
    } else if !Path::new(vad_path).exists() {
        log::warn!("VAD model not found at {}; transcribing without VAD", vad_path);
        None
    } else {
        Some(vad_path.to_string())
    }
}

fn resolve_options(config: &AppConfig, caps: WhisperCapabilities, pass: WhisperPass) -> WhisperOptions {
    let vad_model = if pass.vad { vad_model_for(config, caps) } else { None };

    let vocabulary = config.transcription.vocabulary.trim();
    let prompt = (!vocabulary.is_empty()).then(|| vocabulary.to_string());

    WhisperOptions {
        carry_prompt: prompt.is_some() && caps.carry_initial_prompt,
        vad_model,
        prompt,
        context: pass.context,
    }
}

/// Build the whisper-cli `Command`. On Windows the `CREATE_NO_WINDOW` flag is
/// applied so the console popup never flashes during a recording.
fn build_whisper_command(
    whisper_path: &str,
    model_path: &str,
    audio_path: &Path,
    options: &WhisperOptions,
) -> Command {
    let mut cmd = Command::new(whisper_path);
    cmd.arg("-m")
        .arg(model_path)
        .arg("-f")
        .arg(audio_path)
        .arg("-otxt");

    if let Some(vad_model) = &options.vad_model {
        cmd.arg("--vad")
            .arg("--vad-model")
            .arg(vad_model)
            .arg("--vad-min-silence-duration-ms")
            .arg(VAD_MIN_SILENCE_MS)
            .arg("--vad-speech-pad-ms")
            .arg(VAD_SPEECH_PAD_MS);
    }
    if let Some(prompt) = &options.prompt {
        cmd.arg("--prompt").arg(prompt);
        if options.carry_prompt {
            // Without this, the prompt only conditions the first 30 s window.
            cmd.arg("--carry-initial-prompt");
        }
    }
    if options.context == ContextMode::Fresh {
        cmd.arg("--max-context").arg("0");
    }

    apply_no_console_window(&mut cmd);
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn args_of(cmd: &Command) -> Vec<String> {
        cmd.get_args().map(|s| s.to_string_lossy().to_string()).collect()
    }

    fn plain() -> WhisperOptions {
        WhisperOptions { vad_model: None, prompt: None, carry_prompt: false, context: ContextMode::Carry }
    }

    #[test]
    fn test_plain_command_matches_the_classic_invocation() {
        let audio = PathBuf::from("/tmp/recording.wav");
        let cmd = build_whisper_command("/custom/whisper", "/custom/model.bin", &audio, &plain());

        assert_eq!(cmd.get_program().to_str().unwrap(), "/custom/whisper");
        assert_eq!(
            args_of(&cmd),
            vec!["-m", "/custom/model.bin", "-f", &audio.to_string_lossy(), "-otxt"]
        );
    }

    #[test]
    fn test_vad_prompt_and_fresh_context_flags() {
        let options = WhisperOptions {
            vad_model: Some("/models/silero.bin".into()),
            prompt: Some("ThoughtCast, Claude".into()),
            carry_prompt: true,
            context: ContextMode::Fresh,
        };
        let args = args_of(&build_whisper_command("/w", "/m.bin", Path::new("/a.wav"), &options));

        let vm = args.iter().position(|a| a == "--vad-model").expect("no --vad-model");
        assert_eq!(args[vm + 1], "/models/silero.bin");
        assert!(args.contains(&"--vad".to_string()));
        let p = args.iter().position(|a| a == "--prompt").expect("no --prompt");
        assert_eq!(args[p + 1], "ThoughtCast, Claude");
        assert!(args.contains(&"--carry-initial-prompt".to_string()));
        let mc = args.iter().position(|a| a == "--max-context").expect("no --max-context");
        assert_eq!(args[mc + 1], "0");
    }

    const WITH_VAD: WhisperPass = WhisperPass { context: ContextMode::Carry, vad: true };

    #[test]
    fn test_pass_without_vad_never_adds_vad_flags() {
        let config = config_with(env!("CARGO_MANIFEST_DIR"), "");
        let caps = WhisperCapabilities { vad: true, carry_initial_prompt: true };
        let pass = WhisperPass { context: ContextMode::Fresh, vad: false };
        let opts = resolve_options(&config, caps, pass);
        assert_eq!(opts.vad_model, None);
        assert_eq!(opts.context, ContextMode::Fresh);
    }

    fn config_with(vad: &str, vocabulary: &str) -> AppConfig {
        let mut config = AppConfig::default();
        config.transcription.vad_model_path = vad.to_string();
        config.transcription.vocabulary = vocabulary.to_string();
        config
    }

    #[test]
    fn test_options_skip_vad_on_binaries_without_support() {
        // Cargo.toml exists, so only the capability gate can drop VAD here.
        let config = config_with(env!("CARGO_MANIFEST_DIR"), "");
        let old = WhisperCapabilities { vad: false, carry_initial_prompt: false };
        assert_eq!(resolve_options(&config, old, WITH_VAD).vad_model, None);

        let new = WhisperCapabilities { vad: true, carry_initial_prompt: true };
        assert!(resolve_options(&config, new, WITH_VAD).vad_model.is_some());
    }

    #[test]
    fn test_options_skip_missing_vad_model() {
        let config = config_with("/definitely/missing/silero.bin", "");
        let caps = WhisperCapabilities { vad: true, carry_initial_prompt: true };
        assert_eq!(resolve_options(&config, caps, WITH_VAD).vad_model, None);
    }

    #[test]
    fn test_options_trim_vocabulary_and_only_carry_when_supported() {
        let config = config_with("", "  Annum, Tauri  ");
        let old = WhisperCapabilities::default();
        let opts = resolve_options(&config, old, WITH_VAD);
        assert_eq!(opts.prompt.as_deref(), Some("Annum, Tauri"));
        assert!(!opts.carry_prompt);

        let empty = config_with("", "   ");
        assert_eq!(resolve_options(&empty, old, WITH_VAD).prompt, None);
    }
}

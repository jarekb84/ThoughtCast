//! Audio cues — short, advisory sounds fired at recording state transitions.
//!
//! ## Why this is a separate module from `recording`
//!
//! Cue playback is **advisory**, not part of the recording pipeline. A failure
//! to play a cue (missing output device, file deleted, permission denied) must
//! never stop a recording. By living outside `recording/`, the cue subsystem
//! cannot accidentally take a dependency on recording state that would couple
//! the two.
//!
//! ## Default cue files on disk
//!
//! On first launch we copy three bundled WAVs (`start.wav`, `stop.wav`,
//! `ready.wav`) from the app resource directory into
//! `<documents>/ThoughtCast/sounds/`. Users can drop their own files in that
//! folder and point the config at them, or replace the defaults entirely. The
//! "user-discoverable folder" pattern matches how `config.json` already lives
//! at `<documents>/ThoughtCast/`.
//!
//! An empty `*_cue_path` in `AudioFeedbackConfig` means "use the bundled
//! default" — resolved at playback time, so the user does not have to manually
//! enter a path to get the default behavior.

mod initialization;
mod playback;
mod path_resolver;
mod validator;

pub use initialization::initialize_default_cues;
pub use path_resolver::{default_cue_path, resolve_cue_path, CueType};
pub use playback::play_cue_blocking;
pub use validator::{validate_audio_file, AudioFileValidation};

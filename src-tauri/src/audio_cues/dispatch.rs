//! Play a cue according to the user's audio-feedback settings. Every failure
//! (cues disabled, unresolvable path, no output device) is logged and
//! swallowed: cues are advisory and must never affect a recording.

use crate::audio_cues::{play_cue_blocking, resolve_cue_path, CueType};
use crate::recording::AudioFeedbackConfig;

/// Play `cue` if audio feedback is enabled. Blocks until playback finishes.
pub fn play_feedback_cue(cue: CueType, feedback: &AudioFeedbackConfig) {
    if !feedback.enabled {
        return;
    }

    let path = match resolve_cue_path(cue, feedback) {
        Ok(p) => p,
        Err(e) => {
            log::warn!("{:?} cue path unresolvable ({}), skipping", cue, e);
            return;
        }
    };

    if let Err(e) = play_cue_blocking(&path, feedback.volume) {
        log::warn!("{:?} cue playback failed ({}), skipping", cue, e);
    }
}

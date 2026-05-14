use crate::recording::models::Session;
use chrono::{DateTime, Duration, Utc};
use serde::Serialize;

/// Result of asking whether a session is eligible for batch compression.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "reason", rename_all = "camelCase")]
pub enum Eligibility {
    Eligible,
    AlreadyCompressed,
    ActiveSession,
    TooRecent,
    NoAudioPath,
    UnparseableTimestamp,
}

impl Eligibility {
    pub fn is_eligible(&self) -> bool {
        matches!(self, Eligibility::Eligible)
    }
}

/// Decide whether a single session can be compressed in a batch sweep.
///
/// Pure function — no I/O. Tested against a wide matrix below.
pub fn is_session_compressible(
    session: &Session,
    active_session_id: Option<&str>,
    threshold_days: u32,
    now: DateTime<Utc>,
) -> Eligibility {
    if session.audio_path.trim().is_empty() {
        return Eligibility::NoAudioPath;
    }

    // Only .wav files are compression candidates. Already-.m4a files (or any
    // other extension) get skipped silently.
    if !session.audio_path.to_lowercase().ends_with(".wav") {
        return Eligibility::AlreadyCompressed;
    }

    if active_session_id.is_some_and(|id| id == session.id) {
        return Eligibility::ActiveSession;
    }

    let timestamp = match DateTime::parse_from_rfc3339(&session.timestamp) {
        Ok(t) => t.with_timezone(&Utc),
        Err(_) => return Eligibility::UnparseableTimestamp,
    };

    let age = now - timestamp;
    let threshold = Duration::days(threshold_days as i64);

    if age < threshold {
        return Eligibility::TooRecent;
    }

    Eligibility::Eligible
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn session(id: &str, audio_path: &str, days_ago: i64) -> Session {
        let timestamp = Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap()
            - Duration::days(days_ago);
        Session {
            id: id.to_string(),
            timestamp: timestamp.to_rfc3339(),
            audio_path: audio_path.to_string(),
            duration: 30.0,
            preview: "p".to_string(),
            transcript_path: String::new(),
            clipboard_copied: false,
            transcription_time_seconds: None,
            model_path: None,
            chunking_analysis_seconds: None,
            chunk_count: None,
            chunking_used_fallback: None,
        }
    }

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap()
    }

    #[test]
    fn test_eligible_when_old_enough() {
        let s = session("a", "audio/a.wav", 10);
        assert_eq!(is_session_compressible(&s, None, 7, now()), Eligibility::Eligible);
    }

    #[test]
    fn test_too_recent_when_below_threshold() {
        let s = session("a", "audio/a.wav", 3);
        assert_eq!(
            is_session_compressible(&s, None, 7, now()),
            Eligibility::TooRecent
        );
    }

    #[test]
    fn test_exactly_at_threshold_is_eligible() {
        let s = session("a", "audio/a.wav", 7);
        // 7-day-old session with a 7-day threshold: age == threshold, so the
        // condition `age < threshold` is false → eligible.
        assert_eq!(
            is_session_compressible(&s, None, 7, now()),
            Eligibility::Eligible
        );
    }

    #[test]
    fn test_already_m4a_is_skipped() {
        let s = session("a", "audio/a.m4a", 10);
        assert_eq!(
            is_session_compressible(&s, None, 7, now()),
            Eligibility::AlreadyCompressed
        );
    }

    #[test]
    fn test_uppercase_extension_treated_correctly() {
        let s = session("a", "audio/a.WAV", 10);
        assert_eq!(is_session_compressible(&s, None, 7, now()), Eligibility::Eligible);
    }

    #[test]
    fn test_active_session_is_skipped() {
        let s = session("active-id", "audio/x.wav", 10);
        assert_eq!(
            is_session_compressible(&s, Some("active-id"), 7, now()),
            Eligibility::ActiveSession
        );
    }

    #[test]
    fn test_different_active_id_does_not_skip() {
        let s = session("a", "audio/a.wav", 10);
        assert_eq!(
            is_session_compressible(&s, Some("other-id"), 7, now()),
            Eligibility::Eligible
        );
    }

    #[test]
    fn test_no_audio_path_skipped() {
        let s = session("a", "", 10);
        assert_eq!(
            is_session_compressible(&s, None, 7, now()),
            Eligibility::NoAudioPath
        );
    }

    #[test]
    fn test_unparseable_timestamp() {
        let mut s = session("a", "audio/a.wav", 10);
        s.timestamp = "not a date".to_string();
        assert_eq!(
            is_session_compressible(&s, None, 7, now()),
            Eligibility::UnparseableTimestamp
        );
    }

    #[test]
    fn test_zero_threshold_makes_everything_eligible() {
        let s = session("a", "audio/a.wav", 0);
        assert_eq!(is_session_compressible(&s, None, 0, now()), Eligibility::Eligible);
    }
}

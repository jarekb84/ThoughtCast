/**
 * Represents a single audio recording session with its metadata and transcription
 */
export interface Session {
  /** Unique identifier for the session (timestamp-based) */
  id: string;
  /** Preview text from the transcript (first 100 chars) */
  preview: string;
  /** ISO 8601 timestamp when the recording was created */
  timestamp: string;
  /** Relative path to the audio file (e.g., "audio/2024-10-31_15-30-00.wav") */
  audio_path: string;
  /** Recording duration in seconds */
  duration: number;
  /** Relative path to the transcript file (e.g., "text/2024-10-31_15-30-00.txt") */
  transcript_path?: string;
  /** Whether the transcript was automatically copied to clipboard */
  clipboard_copied?: boolean;
  /** Wall-clock seconds spent on silence-detect + split. Absent for unchunked recordings. */
  chunking_analysis_seconds?: number;
  /** Number of chunks the recording was split into. Absent when chunking did not run. */
  chunk_count?: number;
  /** True when the planner had to fall back to a hard cut (no silence in window). */
  chunking_used_fallback?: boolean;
  /** Signal-level health measured at transcription. Absent for older sessions. */
  recording_quality?: RecordingQuality;
}

export type QualityRating = 'good' | 'fair' | 'poor';
export type QualityIssue = 'too-quiet' | 'noisy' | 'clipping' | 'uneven-level';

/**
 * Mirrors Rust `RecordingQuality` (recording/audio/quality.rs). Levels are
 * dBFS of 50 ms frames: speech = 90th percentile, noise floor = 10th.
 */
export interface RecordingQuality {
  speech_level_db: number;
  noise_floor_db: number;
  snr_db: number;
  clipped_percent: number;
  /** Spread of the speech level between the loudest and quietest minutes. */
  level_swing_db: number;
  rating: QualityRating;
  issues: QualityIssue[];
}

/**
 * Index containing all recording sessions
 */
export interface SessionIndex {
  sessions: Session[];
}

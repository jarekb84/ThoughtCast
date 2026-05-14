import { Session } from './Session';

/**
 * Event payload emitted when transcription completes successfully
 */
export interface TranscriptionCompleteEvent {
  session: Session;
}

/**
 * Event payload emitted when transcription fails
 */
export interface TranscriptionErrorEvent {
  session_id: string;
  error: string;
}

/**
 * Per-chunk progress for a chunked transcription. Emitted once per chunk
 * just before that chunk's Whisper pass starts. `current` is 1-indexed.
 *
 * Single-shot recordings never emit this event — the UI falls back to its
 * time-based progress estimate.
 */
export interface TranscriptionProgressEvent {
  session_id: string;
  current: number;
  total: number;
}

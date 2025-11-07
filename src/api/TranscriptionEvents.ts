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

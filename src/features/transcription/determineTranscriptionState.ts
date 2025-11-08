import { Session } from '../../api';

/**
 * Transcription state data for a session
 */
export interface TranscriptionState {
  /** Whether transcription is currently in progress */
  isTranscribing: boolean;
  /** Audio duration to use for progress calculation */
  audioDurationSeconds: number;
}

/**
 * Determine if a session is currently being transcribed
 *
 * Business logic for identifying active transcription state based on:
 * - Session preview text indicating processing
 * - Global processing state flag
 *
 * @param selectedSession - Currently selected session (or null)
 * @param isProcessing - Global processing state flag
 * @param recordingDuration - Current recording duration (fallback if no session)
 * @returns Transcription state data
 */
export function determineTranscriptionState(
  selectedSession: Session | null,
  isProcessing: boolean,
  recordingDuration: number
): TranscriptionState {
  const isTranscribing =
    (selectedSession?.preview === 'Processing...') || isProcessing;

  const audioDurationSeconds = selectedSession?.duration ?? recordingDuration;

  return {
    isTranscribing,
    audioDurationSeconds,
  };
}

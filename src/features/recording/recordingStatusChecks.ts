import { RecordingStatus } from "../../api";

/**
 * Check if recording is in paused state
 *
 * @param status - Current recording status
 * @returns True if recording is paused
 */
export function isPausedStatus(status: RecordingStatus): boolean {
  return status === 'paused';
}

/**
 * Check if recording is in idle state
 *
 * @param status - Current recording status
 * @returns True if not recording
 */
export function isIdleStatus(status: RecordingStatus): boolean {
  return status === 'idle';
}

/**
 * Check if recording is in active recording state
 *
 * @param status - Current recording status
 * @returns True if actively recording
 */
export function isRecordingStatus(status: RecordingStatus): boolean {
  return status === 'recording';
}

/**
 * Check if recording session is active (recording or paused)
 *
 * @param status - Current recording status
 * @returns True if session is active (not idle)
 */
export function isActiveSession(status: RecordingStatus): boolean {
  return status === 'recording' || status === 'paused';
}

/**
 * Recording status representing the current state of a recording session
 *
 * Matches the Rust RecordingStatus enum from the backend
 */
export type RecordingStatus = 'idle' | 'recording' | 'paused';

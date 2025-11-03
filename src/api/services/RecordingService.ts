import { Session, ApiError, RecordingStatus } from '..';
import { wrapTauriInvoke } from './tauriInvokeWrapper';

/**
 * Service interface for recording-related backend operations
 */
export interface IRecordingService {
  /**
   * Begin audio recording
   * @throws {ApiError} If recording fails to start
   */
  startRecording(): Promise<void>;

  /**
   * Pause the current recording
   * @throws {ApiError} If recording fails to pause
   */
  pauseRecording(): Promise<void>;

  /**
   * Resume a paused recording
   * @throws {ApiError} If recording fails to resume
   */
  resumeRecording(): Promise<void>;

  /**
   * Cancel the current recording without saving
   * @throws {ApiError} If recording fails to cancel
   */
  cancelRecording(): Promise<void>;

  /**
   * Stop recording and process the audio file
   * @returns The newly created session with transcription
   * @throws {ApiError} If recording fails to stop or process
   */
  stopRecording(): Promise<Session>;

  /**
   * Get the current recording duration in seconds (excluding paused time)
   * @returns Duration in seconds
   * @throws {ApiError} If duration retrieval fails
   */
  getRecordingDuration(): Promise<number>;

  /**
   * Get the current recording status
   * @returns Current recording status
   * @throws {ApiError} If status retrieval fails
   */
  getRecordingStatus(): Promise<RecordingStatus>;
}

/**
 * Tauri implementation of recording service
 *
 * All audio recording operations are centralized here.
 */
export class TauriRecordingService implements IRecordingService {
  async startRecording(): Promise<void> {
    return wrapTauriInvoke<void>(
      'start_recording',
      undefined,
      'Failed to start recording',
      'RECORDING_START_FAILED'
    );
  }

  async pauseRecording(): Promise<void> {
    return wrapTauriInvoke<void>(
      'pause_recording',
      undefined,
      'Failed to pause recording',
      'RECORDING_PAUSE_FAILED'
    );
  }

  async resumeRecording(): Promise<void> {
    return wrapTauriInvoke<void>(
      'resume_recording',
      undefined,
      'Failed to resume recording',
      'RECORDING_RESUME_FAILED'
    );
  }

  async cancelRecording(): Promise<void> {
    return wrapTauriInvoke<void>(
      'cancel_recording',
      undefined,
      'Failed to cancel recording',
      'RECORDING_CANCEL_FAILED'
    );
  }

  async stopRecording(): Promise<Session> {
    return wrapTauriInvoke<Session>(
      'stop_recording',
      undefined,
      'Failed to stop recording',
      'RECORDING_STOP_FAILED'
    );
  }

  async getRecordingDuration(): Promise<number> {
    return wrapTauriInvoke<number>(
      'get_recording_duration',
      undefined,
      'Failed to get recording duration',
      'RECORDING_DURATION_FAILED'
    );
  }

  async getRecordingStatus(): Promise<RecordingStatus> {
    return wrapTauriInvoke<RecordingStatus>(
      'get_recording_status',
      undefined,
      'Failed to get recording status',
      'RECORDING_STATUS_FAILED'
    );
  }
}

/**
 * Mock implementation for testing
 */
export class MockRecordingService implements IRecordingService {
  private status: RecordingStatus = 'idle';
  private recordingStartTime: number | null = null;
  private pauseStartTime: number | null = null;
  private totalPausedDurationMs = 0;
  private mockDuration = 0;

  async startRecording(): Promise<void> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 50));

    if (this.status !== 'idle') {
      throw new ApiError(
        'Recording already in progress',
        undefined,
        'RECORDING_ALREADY_STARTED'
      );
    }

    this.status = 'recording';
    this.totalPausedDurationMs = 0;
    this.pauseStartTime = null;
    // Only track elapsed time if mockDuration not explicitly set
    if (this.mockDuration === 0) {
      this.recordingStartTime = Date.now();
    }
  }

  async pauseRecording(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 10));

    if (this.status !== 'recording') {
      throw new ApiError(
        'No active recording to pause',
        undefined,
        'RECORDING_NOT_STARTED'
      );
    }

    this.status = 'paused';
    this.pauseStartTime = Date.now();
  }

  async resumeRecording(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 10));

    if (this.status !== 'paused') {
      throw new ApiError(
        'No paused recording to resume',
        undefined,
        'RECORDING_NOT_PAUSED'
      );
    }

    if (this.pauseStartTime) {
      this.totalPausedDurationMs += Date.now() - this.pauseStartTime;
    }

    this.status = 'recording';
    this.pauseStartTime = null;
  }

  async cancelRecording(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 10));

    if (this.status === 'idle') {
      throw new ApiError(
        'No active recording to cancel',
        undefined,
        'RECORDING_NOT_STARTED'
      );
    }

    this.status = 'idle';
    this.recordingStartTime = null;
    this.pauseStartTime = null;
    this.totalPausedDurationMs = 0;
    this.mockDuration = 0;
  }

  async stopRecording(): Promise<Session> {
    // Simulate async operation with processing time
    await new Promise(resolve => setTimeout(resolve, 200));

    if (this.status === 'idle') {
      throw new ApiError(
        'No recording in progress',
        undefined,
        'RECORDING_NOT_STARTED'
      );
    }

    // Finalize pause duration if currently paused
    if (this.status === 'paused' && this.pauseStartTime) {
      this.totalPausedDurationMs += Date.now() - this.pauseStartTime;
    }

    const duration = this.mockDuration > 0
      ? this.mockDuration
      : this.recordingStartTime
        ? (Date.now() - this.recordingStartTime - this.totalPausedDurationMs) / 1000
        : 0;

    const timestamp = new Date().toISOString();
    const id = timestamp.replace(/[:.]/g, '-').substring(0, 19);

    const newSession: Session = {
      id,
      preview: 'Mock transcript from recording...',
      timestamp,
      audio_path: `audio/${id}.wav`,
      duration,
      transcript_path: `text/${id}.txt`,
      clipboard_copied: true
    };

    this.status = 'idle';
    this.recordingStartTime = null;
    this.pauseStartTime = null;
    this.totalPausedDurationMs = 0;
    this.mockDuration = 0;

    return newSession;
  }

  async getRecordingDuration(): Promise<number> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 10));

    if (this.status === 'idle' || !this.recordingStartTime) {
      return 0;
    }

    let totalPausedMs = this.totalPausedDurationMs;
    if (this.status === 'paused' && this.pauseStartTime) {
      totalPausedMs += Date.now() - this.pauseStartTime;
    }

    return (Date.now() - this.recordingStartTime - totalPausedMs) / 1000;
  }

  async getRecordingStatus(): Promise<RecordingStatus> {
    await new Promise(resolve => setTimeout(resolve, 10));
    return this.status;
  }

  /**
   * Test utility: Simulate recording for a specific duration
   */
  setMockDuration(seconds: number): void {
    this.mockDuration = seconds;
  }

  /**
   * Test utility: Check current recording status
   */
  getStatus(): RecordingStatus {
    return this.status;
  }

  /**
   * Test utility: Reset recording state
   */
  reset(): void {
    this.status = 'idle';
    this.recordingStartTime = null;
    this.pauseStartTime = null;
    this.totalPausedDurationMs = 0;
    this.mockDuration = 0;
  }
}

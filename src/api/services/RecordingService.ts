import { Session, ApiError } from '..';
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
   * Stop recording and process the audio file
   * @returns The newly created session with transcription
   * @throws {ApiError} If recording fails to stop or process
   */
  stopRecording(): Promise<Session>;

  /**
   * Get the current recording duration in seconds
   * @returns Duration in seconds
   * @throws {ApiError} If duration retrieval fails
   */
  getRecordingDuration(): Promise<number>;
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
}

/**
 * Mock implementation for testing
 */
export class MockRecordingService implements IRecordingService {
  private isRecording = false;
  private recordingStartTime: number | null = null;
  private mockDuration = 0;

  async startRecording(): Promise<void> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 50));

    if (this.isRecording) {
      throw new ApiError(
        'Recording already in progress',
        undefined,
        'RECORDING_ALREADY_STARTED'
      );
    }

    this.isRecording = true;
    // Only track elapsed time if mockDuration not explicitly set
    if (this.mockDuration === 0) {
      this.recordingStartTime = Date.now();
    }
  }

  async stopRecording(): Promise<Session> {
    // Simulate async operation with processing time
    await new Promise(resolve => setTimeout(resolve, 200));

    if (!this.isRecording) {
      throw new ApiError(
        'No recording in progress',
        undefined,
        'RECORDING_NOT_STARTED'
      );
    }

    this.isRecording = false;
    const duration = this.mockDuration > 0
      ? this.mockDuration
      : this.recordingStartTime
        ? (Date.now() - this.recordingStartTime) / 1000
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

    this.recordingStartTime = null;
    this.mockDuration = 0;

    return newSession;
  }

  async getRecordingDuration(): Promise<number> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 10));

    if (!this.isRecording || !this.recordingStartTime) {
      return 0;
    }

    return (Date.now() - this.recordingStartTime) / 1000;
  }

  /**
   * Test utility: Simulate recording for a specific duration
   */
  setMockDuration(seconds: number): void {
    this.mockDuration = seconds;
  }

  /**
   * Test utility: Check if currently recording
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Test utility: Reset recording state
   */
  reset(): void {
    this.isRecording = false;
    this.recordingStartTime = null;
    this.mockDuration = 0;
  }
}

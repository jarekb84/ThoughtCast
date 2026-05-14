import { ApiError, Session } from '..';
import { wrapTauriInvoke } from './tauriInvokeWrapper';

/**
 * Service interface for transcript-related backend operations
 */
export interface ITranscriptService {
  /**
   * Load transcript text for a specific session
   * @param sessionId - The unique session identifier
   * @returns The transcript text content
   * @throws {ApiError} If transcript loading fails
   */
  loadTranscript(sessionId: string): Promise<string>;

  /**
   * Kick off re-transcription of a session's audio file.
   *
   * Returns immediately with the session row marked `preview: "Processing..."`
   * so the UI's existing transcribing view (the same one used after Stop
   * Recording) can light up. The actual Whisper pass runs on a background
   * thread and emits `transcription-complete` / `transcription-progress` /
   * `transcription-error` Tauri events that `useRecordingWorkflow` already
   * subscribes to.
   *
   * @param sessionId - The unique session identifier
   * @returns The session row with its in-flight `preview` marker
   * @throws {ApiError} If retranscription cannot be started (e.g. missing audio)
   */
  retranscribe(sessionId: string): Promise<Session>;
}

/**
 * Tauri implementation of transcript service
 *
 * All transcript loading and processing operations are centralized here.
 */
export class TauriTranscriptService implements ITranscriptService {
  async loadTranscript(sessionId: string): Promise<string> {
    return wrapTauriInvoke<string>(
      'load_transcript',
      { sessionId },
      `Failed to load transcript for session: ${sessionId}`,
      'TRANSCRIPT_LOAD_FAILED'
    );
  }

  async retranscribe(sessionId: string): Promise<Session> {
    return wrapTauriInvoke<Session>(
      'retranscribe_session',
      { sessionId },
      `Failed to retranscribe session: ${sessionId}`,
      'RETRANSCRIBE_FAILED'
    );
  }
}

/**
 * Mock implementation for testing
 */
export class MockTranscriptService implements ITranscriptService {
  private mockTranscripts: Map<string, string> = new Map([
    [
      '2024-11-01_10-30-00',
      'This is a mock transcript for the first test session. It contains sample text that would normally come from Whisper transcription.'
    ],
    [
      '2024-11-01_14-15-00',
      'Another mock transcript for testing purposes. This one has different content to verify the service is working correctly.'
    ]
  ]);

  async loadTranscript(sessionId: string): Promise<string> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));

    const transcript = this.mockTranscripts.get(sessionId);
    if (!transcript) {
      throw new ApiError(
        `Transcript not found for session: ${sessionId}`,
        undefined,
        'TRANSCRIPT_NOT_FOUND'
      );
    }

    return transcript;
  }

  async retranscribe(sessionId: string): Promise<Session> {
    // Simulate the immediate-return contract of the real Tauri command.
    await new Promise(resolve => setTimeout(resolve, 50));

    const existingTranscript = this.mockTranscripts.get(sessionId);
    if (!existingTranscript) {
      throw new ApiError(
        `Session not found for retranscription: ${sessionId}`,
        undefined,
        'SESSION_NOT_FOUND'
      );
    }

    // Pre-update the mock so a later call to loadTranscript reflects the
    // "re-transcribed" content. Real flow updates the file on disk before
    // emitting `transcription-complete`.
    const newTranscript = `[Re-transcribed] ${existingTranscript}`;
    this.mockTranscripts.set(sessionId, newTranscript);

    return {
      id: sessionId,
      preview: 'Processing...',
      timestamp: new Date().toISOString(),
      audio_path: `audio/${sessionId}.m4a`,
      duration: 0,
      transcript_path: `text/${sessionId}.txt`,
    };
  }

  /**
   * Test utility: Set mock transcript for a session
   */
  setMockTranscript(sessionId: string, transcript: string): void {
    this.mockTranscripts.set(sessionId, transcript);
  }

  /**
   * Test utility: Clear all mock transcripts
   */
  clearMockTranscripts(): void {
    this.mockTranscripts.clear();
  }

  /**
   * Test utility: Get all mock transcripts
   */
  getMockTranscripts(): Map<string, string> {
    return new Map(this.mockTranscripts);
  }
}

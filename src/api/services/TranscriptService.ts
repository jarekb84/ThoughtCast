import { ApiError } from '..';
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
   * Re-transcribe a session's audio file
   * @param sessionId - The unique session identifier
   * @returns The new transcript text
   * @throws {ApiError} If retranscription fails
   */
  retranscribe(sessionId: string): Promise<string>;
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

  async retranscribe(sessionId: string): Promise<string> {
    return wrapTauriInvoke<string>(
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

  async retranscribe(sessionId: string): Promise<string> {
    // Simulate longer async operation for transcription
    await new Promise(resolve => setTimeout(resolve, 500));

    const existingTranscript = this.mockTranscripts.get(sessionId);
    if (!existingTranscript) {
      throw new ApiError(
        `Session not found for retranscription: ${sessionId}`,
        undefined,
        'SESSION_NOT_FOUND'
      );
    }

    // Generate "updated" transcript
    const newTranscript = `[Re-transcribed] ${existingTranscript}`;
    this.mockTranscripts.set(sessionId, newTranscript);

    return newTranscript;
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

import { wrapTauriInvoke } from './tauriInvokeWrapper';

/**
 * Service interface for clipboard-related backend operations
 */
export interface IClipboardService {
  /**
   * Copy a session's transcript to the system clipboard
   * @param sessionId - The unique session identifier
   * @throws {ApiError} If clipboard copy fails
   */
  copyTranscriptToClipboard(sessionId: string): Promise<void>;
}

/**
 * Tauri implementation of clipboard service
 *
 * All clipboard operations are centralized here.
 */
export class TauriClipboardService implements IClipboardService {
  async copyTranscriptToClipboard(sessionId: string): Promise<void> {
    return wrapTauriInvoke<void>(
      'copy_transcript_to_clipboard',
      { sessionId },
      `Failed to copy transcript to clipboard for session: ${sessionId}`,
      'CLIPBOARD_COPY_FAILED'
    );
  }
}

/**
 * Mock implementation for testing
 */
export class MockClipboardService implements IClipboardService {
  private copiedContent: string | null = null;
  private copiedSessionId: string | null = null;

  async copyTranscriptToClipboard(sessionId: string): Promise<void> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 50));

    // Simulate successful copy
    this.copiedSessionId = sessionId;
    this.copiedContent = `Mock transcript content for session: ${sessionId}`;
  }

  /**
   * Test utility: Get the last copied content
   */
  getLastCopiedContent(): string | null {
    return this.copiedContent;
  }

  /**
   * Test utility: Get the last copied session ID
   */
  getLastCopiedSessionId(): string | null {
    return this.copiedSessionId;
  }

  /**
   * Test utility: Clear clipboard state
   */
  clearClipboard(): void {
    this.copiedContent = null;
    this.copiedSessionId = null;
  }
}

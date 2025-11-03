import { Session, SessionIndex, ApiError } from '..';
import { wrapTauriInvoke } from './tauriInvokeWrapper';

/**
 * Service interface for session-related backend operations
 */
export interface ISessionService {
  /**
   * Retrieves all sessions from the backend
   * @throws {ApiError} If session retrieval fails
   */
  getSessions(): Promise<SessionIndex>;

  /**
   * Retrieves a specific session by ID
   * @param sessionId - The unique session identifier
   * @throws {ApiError} If session not found or retrieval fails
   */
  getSession(sessionId: string): Promise<Session>;
}

/**
 * Tauri implementation of session service
 *
 * All session loading and retrieval operations are centralized here.
 */
export class TauriSessionService implements ISessionService {
  async getSessions(): Promise<SessionIndex> {
    return wrapTauriInvoke<SessionIndex>(
      'get_sessions',
      undefined,
      'Failed to load sessions',
      'SESSION_LOAD_FAILED'
    );
  }

  async getSession(sessionId: string): Promise<Session> {
    try {
      // First, get all sessions and find the specific one
      const index = await this.getSessions();
      const session = index.sessions.find(s => s.id === sessionId);

      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      return session;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        `Failed to load session: ${sessionId}`,
        error,
        'SESSION_NOT_FOUND'
      );
    }
  }
}

/**
 * Mock implementation for testing
 */
export class MockSessionService implements ISessionService {
  private mockSessions: Session[] = [
    {
      id: '2024-11-01_10-30-00',
      preview: 'This is a mock transcript preview for testing purposes...',
      timestamp: '2024-11-01T10:30:00Z',
      audio_path: 'audio/2024-11-01_10-30-00.wav',
      duration: 45.5,
      transcript_path: 'text/2024-11-01_10-30-00.txt',
      clipboard_copied: true
    },
    {
      id: '2024-11-01_14-15-00',
      preview: 'Another mock session with different content...',
      timestamp: '2024-11-01T14:15:00Z',
      audio_path: 'audio/2024-11-01_14-15-00.wav',
      duration: 32.0,
      transcript_path: 'text/2024-11-01_14-15-00.txt',
      clipboard_copied: false
    }
  ];

  async getSessions(): Promise<SessionIndex> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
    return { sessions: this.mockSessions };
  }

  async getSession(sessionId: string): Promise<Session> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 50));

    const session = this.mockSessions.find(s => s.id === sessionId);
    if (!session) {
      throw new ApiError(
        `Session not found: ${sessionId}`,
        undefined,
        'SESSION_NOT_FOUND'
      );
    }

    return session;
  }

  /**
   * Test utility: Add a mock session
   */
  addMockSession(session: Session): void {
    this.mockSessions.push(session);
  }

  /**
   * Test utility: Clear all mock sessions
   */
  clearMockSessions(): void {
    this.mockSessions = [];
  }
}

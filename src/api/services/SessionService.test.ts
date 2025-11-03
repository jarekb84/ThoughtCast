import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriSessionService, MockSessionService } from './SessionService';
import { ApiError } from '..';

// Mock the Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('TauriSessionService', () => {
  let service: TauriSessionService;
  let mockInvoke: any;

  beforeEach(async () => {
    service = new TauriSessionService();
    const { invoke } = await import('@tauri-apps/api/core');
    mockInvoke = invoke as any;
    vi.clearAllMocks();
  });

  describe('getSessions', () => {
    it('should return sessions from backend', async () => {
      const mockSessions = {
        sessions: [
          {
            id: '2024-11-01_10-00-00',
            preview: 'Test session',
            timestamp: '2024-11-01T10:00:00Z',
            audio_path: 'audio/2024-11-01_10-00-00.wav',
            duration: 30,
            transcript_path: 'text/2024-11-01_10-00-00.txt'
          }
        ]
      };

      mockInvoke.mockResolvedValue(mockSessions);

      const result = await service.getSessions();

      expect(mockInvoke).toHaveBeenCalledWith('get_sessions', undefined);
      expect(result).toEqual(mockSessions);
    });

    it('should wrap Tauri errors in ApiError', async () => {
      const backendError = new Error('Backend connection failed');
      mockInvoke.mockRejectedValue(backendError);

      await expect(service.getSessions()).rejects.toThrow(ApiError);
      await expect(service.getSessions()).rejects.toThrow('Failed to load sessions');
    });

    it('should include error code in ApiError', async () => {
      mockInvoke.mockRejectedValue(new Error('Backend error'));

      try {
        await service.getSessions();
        expect.fail('Should have thrown ApiError');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe('SESSION_LOAD_FAILED');
      }
    });
  });

  describe('getSession', () => {
    it('should return specific session by ID', async () => {
      const mockSessions = {
        sessions: [
          {
            id: '2024-11-01_10-00-00',
            preview: 'Test session',
            timestamp: '2024-11-01T10:00:00Z',
            audio_path: 'audio/2024-11-01_10-00-00.wav',
            duration: 30
          }
        ]
      };

      mockInvoke.mockResolvedValue(mockSessions);

      const result = await service.getSession('2024-11-01_10-00-00');

      expect(result).toEqual(mockSessions.sessions[0]);
    });

    it('should throw ApiError when session not found', async () => {
      mockInvoke.mockResolvedValue({ sessions: [] });

      await expect(service.getSession('nonexistent')).rejects.toThrow(ApiError);
      await expect(service.getSession('nonexistent')).rejects.toThrow('Failed to load session: nonexistent');
    });
  });
});

describe('MockSessionService', () => {
  let service: MockSessionService;

  beforeEach(() => {
    service = new MockSessionService();
  });

  describe('getSessions', () => {
    it('should return mock sessions', async () => {
      const result = await service.getSessions();

      expect(result.sessions).toBeInstanceOf(Array);
      expect(result.sessions.length).toBeGreaterThan(0);
      expect(result.sessions[0]).toHaveProperty('id');
      expect(result.sessions[0]).toHaveProperty('preview');
      expect(result.sessions[0]).toHaveProperty('timestamp');
    });

    it('should simulate async operation', async () => {
      const start = Date.now();
      await service.getSessions();
      const duration = Date.now() - start;

      // Should take at least 100ms (the simulated delay)
      expect(duration).toBeGreaterThanOrEqual(90); // Allow small margin
    });
  });

  describe('getSession', () => {
    it('should return specific session by ID', async () => {
      const sessions = await service.getSessions();
      const firstSessionId = sessions.sessions[0].id;

      const result = await service.getSession(firstSessionId);

      expect(result.id).toBe(firstSessionId);
    });

    it('should throw ApiError when session not found', async () => {
      await expect(service.getSession('nonexistent')).rejects.toThrow(ApiError);
      await expect(service.getSession('nonexistent')).rejects.toThrow('Session not found: nonexistent');
    });
  });

  describe('test utilities', () => {
    it('should allow adding mock sessions', async () => {
      const newSession = {
        id: 'test-session',
        preview: 'Test',
        timestamp: '2024-11-01T12:00:00Z',
        audio_path: 'audio/test.wav',
        duration: 10
      };

      service.addMockSession(newSession);
      const result = await service.getSession('test-session');

      expect(result).toEqual(newSession);
    });

    it('should allow clearing mock sessions', async () => {
      service.clearMockSessions();
      const result = await service.getSessions();

      expect(result.sessions).toEqual([]);
    });
  });
});

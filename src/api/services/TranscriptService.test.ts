import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriTranscriptService, MockTranscriptService } from './TranscriptService';
import { ApiError } from '..';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('TauriTranscriptService', () => {
  let service: TauriTranscriptService;
  let mockInvoke: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    service = new TauriTranscriptService();
    const { invoke } = await import('@tauri-apps/api/core');
    mockInvoke = invoke as ReturnType<typeof vi.fn>;
    vi.clearAllMocks();
  });

  describe('loadTranscript', () => {
    it('should load transcript text for session', async () => {
      const mockTranscript = 'This is the transcribed text from the audio file.';
      mockInvoke.mockResolvedValue(mockTranscript);

      const result = await service.loadTranscript('2024-11-01_10-00-00');

      expect(mockInvoke).toHaveBeenCalledWith('load_transcript', {
        sessionId: '2024-11-01_10-00-00'
      });
      expect(result).toBe(mockTranscript);
    });

    it('should wrap errors in ApiError with session ID', async () => {
      mockInvoke.mockRejectedValue(new Error('File not found'));

      await expect(service.loadTranscript('missing-session')).rejects.toThrow(ApiError);
      await expect(service.loadTranscript('missing-session')).rejects.toThrow(
        'Failed to load transcript for session: missing-session'
      );
    });

    it('should include error code', async () => {
      mockInvoke.mockRejectedValue(new Error('Error'));

      try {
        await service.loadTranscript('session-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as ApiError).code).toBe('TRANSCRIPT_LOAD_FAILED');
      }
    });
  });

  describe('retranscribe', () => {
    it('should retranscribe session and return new transcript', async () => {
      const mockNewTranscript = 'Updated transcription with better accuracy.';
      mockInvoke.mockResolvedValue(mockNewTranscript);

      const result = await service.retranscribe('2024-11-01_10-00-00');

      expect(mockInvoke).toHaveBeenCalledWith('retranscribe_session', {
        sessionId: '2024-11-01_10-00-00'
      });
      expect(result).toBe(mockNewTranscript);
    });

    it('should wrap errors in ApiError', async () => {
      mockInvoke.mockRejectedValue(new Error('Whisper not configured'));

      await expect(service.retranscribe('session-id')).rejects.toThrow(ApiError);
      await expect(service.retranscribe('session-id')).rejects.toThrow(
        'Failed to retranscribe session: session-id'
      );
    });

    it('should include error code', async () => {
      mockInvoke.mockRejectedValue(new Error('Error'));

      try {
        await service.retranscribe('session-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as ApiError).code).toBe('RETRANSCRIBE_FAILED');
      }
    });
  });
});

describe('MockTranscriptService', () => {
  let service: MockTranscriptService;

  beforeEach(() => {
    service = new MockTranscriptService();
  });

  describe('loadTranscript', () => {
    it('should return mock transcript for valid session', async () => {
      const result = await service.loadTranscript('2024-11-01_10-30-00');

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should throw ApiError for unknown session', async () => {
      await expect(service.loadTranscript('unknown-session')).rejects.toThrow(ApiError);
      await expect(service.loadTranscript('unknown-session')).rejects.toThrow(
        'Transcript not found for session: unknown-session'
      );
    });

    it('should simulate async operation', async () => {
      const start = Date.now();
      await service.loadTranscript('2024-11-01_10-30-00');
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(90); // ~100ms delay
    });
  });

  describe('retranscribe', () => {
    it('should return updated transcript', async () => {
      const originalTranscript = await service.loadTranscript('2024-11-01_10-30-00');
      const newTranscript = await service.retranscribe('2024-11-01_10-30-00');

      expect(newTranscript).toContain('[Re-transcribed]');
      expect(newTranscript).toContain(originalTranscript);
    });

    it('should update the stored transcript', async () => {
      await service.retranscribe('2024-11-01_10-30-00');
      const updatedTranscript = await service.loadTranscript('2024-11-01_10-30-00');

      expect(updatedTranscript).toContain('[Re-transcribed]');
    });

    it('should throw for unknown session', async () => {
      await expect(service.retranscribe('unknown-session')).rejects.toThrow(ApiError);
      await expect(service.retranscribe('unknown-session')).rejects.toThrow(
        'Session not found for retranscription: unknown-session'
      );
    });

    it('should simulate longer async operation', async () => {
      const start = Date.now();
      await service.retranscribe('2024-11-01_10-30-00');
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(450); // ~500ms delay
    });
  });

  describe('test utilities', () => {
    it('should allow setting custom transcript', async () => {
      const customTranscript = 'Custom test transcript';
      service.setMockTranscript('test-session', customTranscript);

      const result = await service.loadTranscript('test-session');
      expect(result).toBe(customTranscript);
    });

    it('should allow clearing transcripts', () => {
      service.clearMockTranscripts();
      const transcripts = service.getMockTranscripts();

      expect(transcripts.size).toBe(0);
    });

    it('should allow getting all transcripts', () => {
      const transcripts = service.getMockTranscripts();

      expect(transcripts).toBeInstanceOf(Map);
      expect(transcripts.size).toBeGreaterThan(0);
    });
  });
});

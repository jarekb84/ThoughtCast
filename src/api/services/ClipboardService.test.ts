import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriClipboardService, MockClipboardService } from './ClipboardService';
import { ApiError } from '..';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('TauriClipboardService', () => {
  let service: TauriClipboardService;
  let mockInvoke: any;

  beforeEach(async () => {
    service = new TauriClipboardService();
    const { invoke } = await import('@tauri-apps/api/core');
    mockInvoke = invoke as any;
    vi.clearAllMocks();
  });

  describe('copyTranscriptToClipboard', () => {
    it('should copy transcript to clipboard', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await expect(
        service.copyTranscriptToClipboard('2024-11-01_10-00-00')
      ).resolves.toBeUndefined();

      expect(mockInvoke).toHaveBeenCalledWith('copy_transcript_to_clipboard', {
        sessionId: '2024-11-01_10-00-00'
      });
    });

    it('should wrap errors in ApiError with session ID', async () => {
      mockInvoke.mockRejectedValue(new Error('Clipboard access denied'));

      await expect(service.copyTranscriptToClipboard('session-id')).rejects.toThrow(ApiError);
      await expect(service.copyTranscriptToClipboard('session-id')).rejects.toThrow(
        'Failed to copy transcript to clipboard for session: session-id'
      );
    });

    it('should include error code', async () => {
      mockInvoke.mockRejectedValue(new Error('Error'));

      try {
        await service.copyTranscriptToClipboard('session-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as ApiError).code).toBe('CLIPBOARD_COPY_FAILED');
      }
    });
  });
});

describe('MockClipboardService', () => {
  let service: MockClipboardService;

  beforeEach(() => {
    service = new MockClipboardService();
  });

  describe('copyTranscriptToClipboard', () => {
    it('should simulate copying to clipboard', async () => {
      await service.copyTranscriptToClipboard('test-session');

      expect(service.getLastCopiedSessionId()).toBe('test-session');
      expect(service.getLastCopiedContent()).toContain('test-session');
    });

    it('should update last copied content', async () => {
      await service.copyTranscriptToClipboard('session-1');
      const content1 = service.getLastCopiedContent();

      await service.copyTranscriptToClipboard('session-2');
      const content2 = service.getLastCopiedContent();

      expect(content1).not.toBe(content2);
      expect(content2).toContain('session-2');
    });

    it('should simulate async operation', async () => {
      const start = Date.now();
      await service.copyTranscriptToClipboard('test-session');
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(40); // ~50ms delay
    });
  });

  describe('test utilities', () => {
    it('should track last copied session ID', async () => {
      expect(service.getLastCopiedSessionId()).toBeNull();

      await service.copyTranscriptToClipboard('my-session');

      expect(service.getLastCopiedSessionId()).toBe('my-session');
    });

    it('should track last copied content', async () => {
      expect(service.getLastCopiedContent()).toBeNull();

      await service.copyTranscriptToClipboard('my-session');

      const content = service.getLastCopiedContent();
      expect(content).toBeTruthy();
      expect(content).toContain('my-session');
    });

    it('should allow clearing clipboard', async () => {
      await service.copyTranscriptToClipboard('session');
      service.clearClipboard();

      expect(service.getLastCopiedContent()).toBeNull();
      expect(service.getLastCopiedSessionId()).toBeNull();
    });
  });
});

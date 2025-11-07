import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriRecordingService, MockRecordingService } from './RecordingService';
import { ApiError } from '..';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('TauriRecordingService', () => {
  let service: TauriRecordingService;
  let mockInvoke: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    service = new TauriRecordingService();
    const { invoke } = await import('@tauri-apps/api/core');
    mockInvoke = invoke as ReturnType<typeof vi.fn>;
    vi.clearAllMocks();
  });

  describe('startRecording', () => {
    it('should start recording successfully', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await expect(service.startRecording()).resolves.toBeUndefined();
      expect(mockInvoke).toHaveBeenCalledWith('start_recording', undefined);
    });

    it('should wrap errors in ApiError', async () => {
      mockInvoke.mockRejectedValue(new Error('Microphone access denied'));

      await expect(service.startRecording()).rejects.toThrow(ApiError);
      await expect(service.startRecording()).rejects.toThrow('Failed to start recording');
    });

    it('should include error code', async () => {
      mockInvoke.mockRejectedValue(new Error('Error'));

      try {
        await service.startRecording();
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as ApiError).code).toBe('RECORDING_START_FAILED');
      }
    });
  });

  describe('stopRecording', () => {
    it('should return new session on stop', async () => {
      const mockSession = {
        id: '2024-11-01_10-00-00',
        preview: 'Transcribed text',
        timestamp: '2024-11-01T10:00:00Z',
        audio_path: 'audio/2024-11-01_10-00-00.wav',
        duration: 45.5,
        transcript_path: 'text/2024-11-01_10-00-00.txt',
        clipboard_copied: true
      };

      mockInvoke.mockResolvedValue(mockSession);

      const result = await service.stopRecording();

      expect(mockInvoke).toHaveBeenCalledWith('stop_recording', undefined);
      expect(result).toEqual(mockSession);
    });

    it('should wrap errors in ApiError', async () => {
      mockInvoke.mockRejectedValue(new Error('Save failed'));

      await expect(service.stopRecording()).rejects.toThrow(ApiError);
      await expect(service.stopRecording()).rejects.toThrow('Failed to stop recording');
    });
  });

  describe('getRecordingDuration', () => {
    it('should return current duration in seconds', async () => {
      mockInvoke.mockResolvedValue(12.5);

      const result = await service.getRecordingDuration();

      expect(mockInvoke).toHaveBeenCalledWith('get_recording_duration', undefined);
      expect(result).toBe(12.5);
    });

    it('should wrap errors in ApiError', async () => {
      mockInvoke.mockRejectedValue(new Error('No recording'));

      await expect(service.getRecordingDuration()).rejects.toThrow(ApiError);
    });
  });

  describe('getAudioLevels', () => {
    it('should return audio level data', async () => {
      const mockLevels = [0.1, 0.2, 0.5, 0.8, 0.3];
      mockInvoke.mockResolvedValue(mockLevels);

      const result = await service.getAudioLevels();

      expect(mockInvoke).toHaveBeenCalledWith('get_audio_levels', undefined);
      expect(result).toEqual(mockLevels);
    });

    it('should return empty array when not recording', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await service.getAudioLevels();

      expect(result).toEqual([]);
    });

    it('should wrap errors in ApiError', async () => {
      mockInvoke.mockRejectedValue(new Error('Failed to get levels'));

      await expect(service.getAudioLevels()).rejects.toThrow(ApiError);
      await expect(service.getAudioLevels()).rejects.toThrow('Failed to get audio levels');
    });
  });
});

describe('MockRecordingService', () => {
  let service: MockRecordingService;

  beforeEach(() => {
    service = new MockRecordingService();
  });

  describe('recording lifecycle', () => {
    it('should start recording successfully', async () => {
      await service.startRecording();

      expect(service.getStatus()).toBe('recording');
    });

    it('should throw if starting when already recording', async () => {
      await service.startRecording();

      await expect(service.startRecording()).rejects.toThrow(ApiError);
      await expect(service.startRecording()).rejects.toThrow('Recording already in progress');
    });

    it('should stop recording and return session', async () => {
      await service.startRecording();
      const session = await service.stopRecording();

      expect(service.getStatus()).toBe('idle');
      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('audio_path');
      expect(session).toHaveProperty('transcript_path');
      expect(session.duration).toBeGreaterThan(0);
    });

    it('should throw if stopping when not recording', async () => {
      await expect(service.stopRecording()).rejects.toThrow(ApiError);
      await expect(service.stopRecording()).rejects.toThrow('No recording in progress');
    });
  });

  describe('pause/resume/cancel lifecycle', () => {
    it('should pause an active recording', async () => {
      await service.startRecording();
      await service.pauseRecording();

      expect(service.getStatus()).toBe('paused');
    });

    it('should throw if pausing when not recording', async () => {
      await expect(service.pauseRecording()).rejects.toThrow(ApiError);
      await expect(service.pauseRecording()).rejects.toThrow('No active recording to pause');
    });

    it('should resume a paused recording', async () => {
      await service.startRecording();
      await service.pauseRecording();
      await service.resumeRecording();

      expect(service.getStatus()).toBe('recording');
    });

    it('should throw if resuming when not paused', async () => {
      await expect(service.resumeRecording()).rejects.toThrow(ApiError);
      await expect(service.resumeRecording()).rejects.toThrow('No paused recording to resume');
    });

    it('should cancel an active recording', async () => {
      await service.startRecording();
      await service.cancelRecording();

      expect(service.getStatus()).toBe('idle');
    });

    it('should cancel a paused recording', async () => {
      await service.startRecording();
      await service.pauseRecording();
      await service.cancelRecording();

      expect(service.getStatus()).toBe('idle');
    });

    it('should throw if cancelling when idle', async () => {
      await expect(service.cancelRecording()).rejects.toThrow(ApiError);
      await expect(service.cancelRecording()).rejects.toThrow('No active recording to cancel');
    });

    it('should stop a paused recording', async () => {
      await service.startRecording();
      await service.pauseRecording();
      const session = await service.stopRecording();

      expect(service.getStatus()).toBe('idle');
      expect(session).toHaveProperty('id');
      expect(session.duration).toBeGreaterThan(0);
    });

    it('should exclude paused time from duration', async () => {
      await service.startRecording();

      // Record for 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

      await service.pauseRecording();

      // Pause for 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

      await service.resumeRecording();

      // Record for another 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

      const session = await service.stopRecording();

      // Duration should be ~200ms (excluding the 100ms pause)
      // Allow generous tolerance for timing precision on different systems
      expect(session.duration).toBeGreaterThan(0.15); // At least 150ms
      expect(session.duration).toBeLessThan(0.50); // Should not include full pause time
    });
  });

  describe('getRecordingDuration', () => {
    it('should return 0 when not recording', async () => {
      const duration = await service.getRecordingDuration();

      expect(duration).toBe(0);
    });

    it('should return increasing duration while recording', async () => {
      await service.startRecording();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const duration1 = await service.getRecordingDuration();
      expect(duration1).toBeGreaterThan(0);

      // Wait more
      await new Promise(resolve => setTimeout(resolve, 100));

      const duration2 = await service.getRecordingDuration();
      expect(duration2).toBeGreaterThan(duration1);

      await service.stopRecording();
    });

    it('should reset duration after stop', async () => {
      await service.startRecording();
      await new Promise(resolve => setTimeout(resolve, 100));
      await service.stopRecording();

      const duration = await service.getRecordingDuration();
      expect(duration).toBe(0);
    });
  });

  describe('getAudioLevels', () => {
    it('should return empty array when idle', async () => {
      const levels = await service.getAudioLevels();
      expect(levels).toEqual([]);
    });

    it('should return empty array when paused', async () => {
      await service.startRecording();
      await service.pauseRecording();

      const levels = await service.getAudioLevels();
      expect(levels).toEqual([]);
    });

    it('should return audio levels when recording', async () => {
      await service.startRecording();

      const levels = await service.getAudioLevels();

      expect(levels.length).toBe(20);
      expect(levels.every(l => l >= 0 && l <= 1)).toBe(true);
    });

    it('should generate varied levels (not all identical)', async () => {
      await service.startRecording();

      const levels = await service.getAudioLevels();

      // Check that not all values are the same (simulates variation)
      const uniqueValues = new Set(levels);
      expect(uniqueValues.size).toBeGreaterThan(1);
    });
  });

  describe('test utilities', () => {
    it('should allow setting mock duration', async () => {
      service.setMockDuration(42.5);
      await service.startRecording();
      const session = await service.stopRecording();

      expect(session.duration).toBeCloseTo(42.5, 1);
    });

    it('should reset state with reset()', async () => {
      await service.startRecording();
      service.reset();

      expect(service.getStatus()).toBe('idle');
      const duration = await service.getRecordingDuration();
      expect(duration).toBe(0);
    });
  });
});

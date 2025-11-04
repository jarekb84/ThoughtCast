import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { VersionService } from './VersionService';
import { ApiError } from '../ApiError';

// Mock the Tauri API directly (keep wrapper real to test error handling)
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

const mockInvoke = vi.mocked(invoke);

describe('VersionService', () => {
  let service: VersionService;

  beforeEach(() => {
    service = new VersionService();
    vi.clearAllMocks();
  });

  describe('getAppVersion', () => {
    it('should return version string from Tauri', async () => {
      const expectedVersion = '0.1.5';
      mockInvoke.mockResolvedValue(expectedVersion);

      const result = await service.getAppVersion();

      expect(result).toBe(expectedVersion);
      expect(mockInvoke).toHaveBeenCalledWith('get_app_version', undefined);
    });

    it('should return dev version with -0 suffix', async () => {
      const expectedVersion = '0.1.5-0';
      mockInvoke.mockResolvedValue(expectedVersion);

      const result = await service.getAppVersion();

      expect(result).toBe(expectedVersion);
    });

    it('should return local build version with counter', async () => {
      const expectedVersion = '0.1.5-3';
      mockInvoke.mockResolvedValue(expectedVersion);

      const result = await service.getAppVersion();

      expect(result).toBe(expectedVersion);
    });

    it('should wrap Tauri errors in ApiError', async () => {
      const backendError = new Error('Backend version command failed');
      mockInvoke.mockRejectedValue(backendError);

      await expect(service.getAppVersion()).rejects.toThrow(ApiError);
      await expect(service.getAppVersion()).rejects.toThrow('Failed to retrieve app version');
    });

    it('should preserve error code in wrapped ApiError', async () => {
      mockInvoke.mockRejectedValue(new Error('Package info unavailable'));

      try {
        await service.getAppVersion();
        expect.fail('Should have thrown ApiError');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe('VERSION_FETCH_FAILED');
      }
    });

    it('should handle string errors from backend', async () => {
      mockInvoke.mockRejectedValue('Version command not found');

      await expect(service.getAppVersion()).rejects.toThrow(ApiError);
      await expect(service.getAppVersion()).rejects.toThrow('Failed to retrieve app version');
    });

    it('should handle undefined return value gracefully', async () => {
      mockInvoke.mockResolvedValue(undefined as any);

      const result = await service.getAppVersion();

      expect(result).toBeUndefined();
    });
  });
});

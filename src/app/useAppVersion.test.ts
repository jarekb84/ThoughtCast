import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAppVersion } from './useAppVersion';
import { versionService } from '../api/services/VersionService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { logger } from '../shared/utils/logger';

// Mock dependencies
vi.mock('../api/services/VersionService', () => ({
  versionService: {
    getAppVersion: vi.fn()
  }
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn()
}));

vi.mock('../shared/utils/logger', () => ({
  logger: {
    error: vi.fn()
  }
}));

const mockGetAppVersion = vi.mocked(versionService.getAppVersion);
const mockGetCurrentWindow = vi.mocked(getCurrentWindow);
const mockLoggerError = vi.mocked(logger.error);

describe('useAppVersion', () => {
  let mockWindow: { setTitle: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockWindow = {
      setTitle: vi.fn().mockResolvedValue(undefined)
    };
    mockGetCurrentWindow.mockReturnValue(mockWindow as any);
    vi.clearAllMocks();
  });

  it('should fetch version and update window title', async () => {
    const expectedVersion = '0.1.5';
    mockGetAppVersion.mockResolvedValue(expectedVersion);

    const { result } = renderHook(() => useAppVersion());

    await waitFor(() => {
      expect(result.current).toBe(expectedVersion);
    });

    expect(mockGetAppVersion).toHaveBeenCalledOnce();
    expect(mockWindow.setTitle).toHaveBeenCalledWith('ThoughtCast v0.1.5');
  });

  it('should handle dev version with -0 suffix', async () => {
    const devVersion = '0.1.5-0';
    mockGetAppVersion.mockResolvedValue(devVersion);

    renderHook(() => useAppVersion());

    await waitFor(() => {
      expect(mockWindow.setTitle).toHaveBeenCalledWith('ThoughtCast v0.1.5-0');
    });
  });

  it('should handle local build version with counter', async () => {
    const localVersion = '0.1.5-3';
    mockGetAppVersion.mockResolvedValue(localVersion);

    renderHook(() => useAppVersion());

    await waitFor(() => {
      expect(mockWindow.setTitle).toHaveBeenCalledWith('ThoughtCast v0.1.5-3');
    });
  });

  it('should fall back to default title on version fetch error', async () => {
    const error = new Error('Failed to retrieve app version');
    mockGetAppVersion.mockRejectedValue(error);

    const { result } = renderHook(() => useAppVersion());

    await waitFor(() => {
      expect(mockLoggerError).toHaveBeenCalledWith('Failed to get app version:', error);
    });

    expect(mockWindow.setTitle).toHaveBeenCalledWith('ThoughtCast');
    expect(result.current).toBe(''); // Version state remains empty on error
  });

  it('should handle window API errors gracefully', async () => {
    const expectedVersion = '0.1.5';
    mockGetAppVersion.mockResolvedValue(expectedVersion);
    mockWindow.setTitle.mockRejectedValue(new Error('Window API failed'));

    const { result } = renderHook(() => useAppVersion());

    await waitFor(() => {
      expect(result.current).toBe(expectedVersion);
    });

    // Version state should still be set even if window title update fails
    expect(mockGetAppVersion).toHaveBeenCalledOnce();
  });

  it('should only fetch version once on mount', async () => {
    const expectedVersion = '0.1.5';
    mockGetAppVersion.mockResolvedValue(expectedVersion);

    const { rerender } = renderHook(() => useAppVersion());

    await waitFor(() => {
      expect(mockGetAppVersion).toHaveBeenCalledOnce();
    });

    // Re-render should not trigger another fetch
    rerender();
    expect(mockGetAppVersion).toHaveBeenCalledOnce();
  });

  it('should handle empty version string', async () => {
    mockGetAppVersion.mockResolvedValue('');

    renderHook(() => useAppVersion());

    await waitFor(() => {
      expect(mockWindow.setTitle).toHaveBeenCalledWith('ThoughtCast v');
    });
  });

  it('should not update window title if version service rejects', async () => {
    mockGetAppVersion.mockRejectedValue(new Error('Service unavailable'));

    renderHook(() => useAppVersion());

    await waitFor(() => {
      expect(mockLoggerError).toHaveBeenCalled();
    });

    // Should call setTitle exactly once (fallback), not twice (success + fallback)
    expect(mockWindow.setTitle).toHaveBeenCalledTimes(1);
    expect(mockWindow.setTitle).toHaveBeenCalledWith('ThoughtCast');
  });
});

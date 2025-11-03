import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { formatErrorMessage, hasTranscript, useTranscriptViewer } from './useTranscriptViewer';
import { Session } from '../../api';
import { ApiProvider } from '../../api/ApiContext';
import React from 'react';

// Mock Tauri API to prevent real invocations
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// ===== Pure Function Tests =====

describe('formatErrorMessage', () => {
  it('should format Error instance with message', () => {
    const error = new Error('Something went wrong');
    expect(formatErrorMessage(error)).toBe('Something went wrong');
  });

  it('should convert string to string', () => {
    expect(formatErrorMessage('Error string')).toBe('Error string');
  });

  it('should convert number to string', () => {
    expect(formatErrorMessage(404)).toBe('404');
  });

  it('should convert object to string', () => {
    expect(formatErrorMessage({ code: 500 })).toBe('[object Object]');
  });

  it('should handle null', () => {
    expect(formatErrorMessage(null)).toBe('null');
  });

  it('should handle undefined', () => {
    expect(formatErrorMessage(undefined)).toBe('undefined');
  });
});

describe('hasTranscript', () => {
  it('should return true when session has valid transcript_path', () => {
    const session: Session = {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      duration: 10,
      audio_path: '/path/to/audio.wav',
      transcript_path: '/path/to/transcript.txt',
      preview: 'Test preview',
      clipboard_copied: false,
    };

    expect(hasTranscript(session)).toBe(true);
  });

  it('should return false when transcript_path is empty string', () => {
    const session: Session = {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      duration: 10,
      audio_path: '/path/to/audio.wav',
      transcript_path: '',
      preview: 'Test preview',
      clipboard_copied: false,
    };

    expect(hasTranscript(session)).toBe(false);
  });

  it('should return false when transcript_path is undefined', () => {
    const session: Session = {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      duration: 10,
      audio_path: '/path/to/audio.wav',
      preview: 'Test preview',
      clipboard_copied: false,
    };

    expect(hasTranscript(session)).toBe(false);
  });

  it('should return false when session is null', () => {
    expect(hasTranscript(null)).toBe(false);
  });
});

// ===== Hook Tests =====

describe('useTranscriptViewer', () => {
  const mockTranscriptService = {
    loadTranscript: vi.fn(),
    retranscribe: vi.fn(),
  };

  const mockClipboardService = {
    copyTranscriptToClipboard: vi.fn(),
  };

  const mockSessionService = {
    getSessions: vi.fn(),
  };

  const mockRecordingService = {
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    getRecordingDuration: vi.fn(),
  };

  const mockOnSessionsChanged = vi.fn();

  const sessionWithTranscript: Session = {
    id: 'session-1',
    timestamp: '2024-01-01T00:00:00Z',
    duration: 10,
    audio_path: '/path/to/audio.wav',
    transcript_path: '/path/to/transcript.txt',
    preview: 'Test session',
    clipboard_copied: false,
  };

  const sessionWithoutTranscript: Session = {
    id: 'session-2',
    timestamp: '2024-01-02T00:00:00Z',
    duration: 15,
    audio_path: '/path/to/audio2.wav',
    preview: 'Session without transcript',
    clipboard_copied: false,
  };

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      ApiProvider,
      {
        services: {
          transcriptService: mockTranscriptService as any,
          clipboardService: mockClipboardService as any,
          sessionService: mockSessionService as any,
          recordingService: mockRecordingService as any,
        },
      },
      children
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSessionsChanged.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(
      () => useTranscriptViewer(null, mockOnSessionsChanged),
      { wrapper }
    );

    expect(result.current.transcript).toBeNull();
    expect(result.current.transcriptError).toBeNull();
    expect(result.current.isLoadingTranscript).toBe(false);
    expect(result.current.isRetranscribing).toBe(false);
    expect(result.current.isCopying).toBe(false);
    expect(result.current.copyButtonText).toBe('Copy to Clipboard');
  });

  it('should load transcript when session with transcript is selected', async () => {
    mockTranscriptService.loadTranscript.mockResolvedValue('This is the transcript text');

    const { result } = renderHook(
      () => useTranscriptViewer(sessionWithTranscript, mockOnSessionsChanged),
      { wrapper }
    );

    await waitFor(() => {
      expect(mockTranscriptService.loadTranscript).toHaveBeenCalledWith('session-1');
      expect(result.current.transcript).toBe('This is the transcript text');
      expect(result.current.isLoadingTranscript).toBe(false);
      expect(result.current.transcriptError).toBeNull();
    });
  });

  it('should set error when session has no transcript path', async () => {
    const { result } = renderHook(
      () => useTranscriptViewer(sessionWithoutTranscript, mockOnSessionsChanged),
      { wrapper }
    );

    await waitFor(() => {
      expect(mockTranscriptService.loadTranscript).not.toHaveBeenCalled();
      expect(result.current.transcript).toBeNull();
      expect(result.current.transcriptError).toBe('No transcript available');
    });
  });

  it.skip('should handle transcript loading error', async () => {
    mockTranscriptService.loadTranscript.mockRejectedValue(new Error('Load failed'));

    const { result } = renderHook(
      () => useTranscriptViewer(sessionWithTranscript, mockOnSessionsChanged),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.transcript).toBeNull();
      expect(result.current.transcriptError).toBe('Load failed');
      expect(result.current.isLoadingTranscript).toBe(false);
    });
  });

  it('should clear transcript when session changes to null', async () => {
    mockTranscriptService.loadTranscript.mockResolvedValue('Transcript text');

    const { result, rerender } = renderHook(
      ({ session }) => useTranscriptViewer(session, mockOnSessionsChanged),
      {
        wrapper,
        initialProps: { session: sessionWithTranscript },
      }
    );

    await waitFor(() => {
      expect(result.current.transcript).toBe('Transcript text');
    });

    rerender({ session: null });

    await waitFor(() => {
      expect(result.current.transcript).toBeNull();
      expect(result.current.transcriptError).toBeNull();
    });
  });

  it('should reload transcript when session changes', async () => {
    mockTranscriptService.loadTranscript
      .mockResolvedValueOnce('First transcript')
      .mockResolvedValueOnce('Second transcript');

    const secondSession: Session = {
      ...sessionWithTranscript,
      id: 'session-2',
    };

    const { result, rerender } = renderHook(
      ({ session }) => useTranscriptViewer(session, mockOnSessionsChanged),
      {
        wrapper,
        initialProps: { session: sessionWithTranscript },
      }
    );

    await waitFor(() => {
      expect(result.current.transcript).toBe('First transcript');
    });

    rerender({ session: secondSession });

    await waitFor(() => {
      expect(mockTranscriptService.loadTranscript).toHaveBeenCalledWith('session-2');
      expect(result.current.transcript).toBe('Second transcript');
    });
  });

  it.skip('should copy transcript to clipboard successfully', async () => {
    vi.useFakeTimers();

    mockTranscriptService.loadTranscript.mockResolvedValue('Transcript text');
    mockClipboardService.copyTranscriptToClipboard.mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useTranscriptViewer(sessionWithTranscript, mockOnSessionsChanged),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.transcript).toBe('Transcript text');
    });

    await act(async () => {
      await result.current.handleCopyToClipboard();
    });

    expect(mockClipboardService.copyTranscriptToClipboard).toHaveBeenCalledWith('session-1');
    expect(result.current.copyButtonText).toBe('Copied!');

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.copyButtonText).toBe('Copy to Clipboard');

    vi.useRealTimers();
  });

  it.skip('should handle clipboard copy error', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockTranscriptService.loadTranscript.mockResolvedValue('Transcript text');
    mockClipboardService.copyTranscriptToClipboard.mockRejectedValue(
      new Error('Clipboard access denied')
    );

    const { result } = renderHook(
      () => useTranscriptViewer(sessionWithTranscript, mockOnSessionsChanged),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.transcript).toBe('Transcript text');
    });

    await act(async () => {
      await result.current.handleCopyToClipboard();
    });

    expect(alertSpy).toHaveBeenCalledWith('Failed to copy: Clipboard access denied');
    expect(result.current.isCopying).toBe(false);

    alertSpy.mockRestore();
  });

  it('should not copy if no session selected', async () => {
    const { result } = renderHook(
      () => useTranscriptViewer(null, mockOnSessionsChanged),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleCopyToClipboard();
    });

    expect(mockClipboardService.copyTranscriptToClipboard).not.toHaveBeenCalled();
  });

  it.skip('should retranscribe successfully', async () => {
    mockTranscriptService.loadTranscript.mockResolvedValue('Original transcript');
    mockTranscriptService.retranscribe.mockResolvedValue('New transcript');

    const { result } = renderHook(
      () => useTranscriptViewer(sessionWithTranscript, mockOnSessionsChanged),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.transcript).toBe('Original transcript');
    });

    await act(async () => {
      await result.current.handleRetranscribe();
    });

    expect(mockTranscriptService.retranscribe).toHaveBeenCalledWith('session-1');
    expect(result.current.transcript).toBe('New transcript');
    expect(mockOnSessionsChanged).toHaveBeenCalled();
    expect(result.current.isRetranscribing).toBe(false);
    expect(result.current.isLoadingTranscript).toBe(false);
  });

  it.skip('should handle retranscribe error', async () => {
    mockTranscriptService.loadTranscript.mockResolvedValue('Original transcript');
    mockTranscriptService.retranscribe.mockRejectedValue(new Error('Retranscribe failed'));

    const { result } = renderHook(
      () => useTranscriptViewer(sessionWithTranscript, mockOnSessionsChanged),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.transcript).toBe('Original transcript');
    });

    await act(async () => {
      await result.current.handleRetranscribe();
    });

    expect(result.current.transcript).toBeNull();
    expect(result.current.transcriptError).toBe('Retranscription failed: Retranscribe failed');
    expect(result.current.isRetranscribing).toBe(false);
    expect(result.current.isLoadingTranscript).toBe(false);
  });

  it('should not retranscribe if no session selected', async () => {
    const { result } = renderHook(
      () => useTranscriptViewer(null, mockOnSessionsChanged),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleRetranscribe();
    });

    expect(mockTranscriptService.retranscribe).not.toHaveBeenCalled();
  });

  it.skip('should set loading states during retranscribe', async () => {
    mockTranscriptService.loadTranscript.mockResolvedValue('Original transcript');
    mockTranscriptService.retranscribe.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('New transcript'), 100))
    );

    const { result } = renderHook(
      () => useTranscriptViewer(sessionWithTranscript, mockOnSessionsChanged),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.transcript).toBe('Original transcript');
    });

    act(() => {
      result.current.handleRetranscribe();
    });

    await waitFor(() => {
      expect(result.current.isRetranscribing).toBe(true);
      expect(result.current.isLoadingTranscript).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.isRetranscribing).toBe(false);
      expect(result.current.isLoadingTranscript).toBe(false);
    });
  });

  it.skip('should track copying state', async () => {
    mockTranscriptService.loadTranscript.mockResolvedValue('Transcript text');
    mockClipboardService.copyTranscriptToClipboard.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(), 100))
    );

    const { result } = renderHook(
      () => useTranscriptViewer(sessionWithTranscript, mockOnSessionsChanged),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.transcript).toBe('Transcript text');
    });

    expect(result.current.isCopying).toBe(false);

    act(() => {
      result.current.handleCopyToClipboard();
    });

    await waitFor(() => {
      expect(result.current.isCopying).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.isCopying).toBe(false);
    });
  });
});

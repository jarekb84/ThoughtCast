import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRecordingWorkflow } from './useRecordingWorkflow';
import {
  determineRecordingStatus,
  findSessionById,
  autoSelectFirstSession,
  handleRecordingCaptureFailed,
} from '../features/recording/workflowEventHandlers';
import { Session, RecordingCaptureFailedPayload } from '../api';
import { ApiProvider } from '../api/ApiContext';
import React from 'react';

// Mock Tauri API to prevent real invocations
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock Tauri event system
const mockEventListeners: Map<string, ((event: any) => void)[]> = new Map();

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockImplementation((eventName: string, handler: (event: any) => void) => {
    // Synchronously register handler
    if (!mockEventListeners.has(eventName)) {
      mockEventListeners.set(eventName, []);
    }
    mockEventListeners.get(eventName)!.push(handler);

    // Return unlisten function wrapped in ALREADY resolved promise
    const unlisten = () => {
      const handlers = mockEventListeners.get(eventName);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };

    // Return immediately resolved promise so useEffect doesn't wait
    return Promise.resolve(unlisten);
  }),
}));

// Helper to emit mock events
function emitMockEvent(eventName: string, payload: any) {
  const handlers = mockEventListeners.get(eventName) || [];
  handlers.forEach(handler => handler({ payload }));
}

// ===== Pure Function Tests =====

describe('determineRecordingStatus', () => {
  it('should return success message when transcript exists and clipboard copied', () => {
    const session: Session = {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      duration: 10,
      audio_path: '/path/to/audio.wav',
      transcript_path: '/path/to/transcript.txt',
      preview: 'Test preview',
      clipboard_copied: true,
    };

    expect(determineRecordingStatus(session)).toBe("✅ Transcript copied to clipboard!");
  });

  it('should return warning when transcript exists but clipboard copy failed', () => {
    const session: Session = {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      duration: 10,
      audio_path: '/path/to/audio.wav',
      transcript_path: '/path/to/transcript.txt',
      preview: 'Test preview',
      clipboard_copied: false,
    };

    expect(determineRecordingStatus(session)).toBe(
      "⚠️ Transcription complete (clipboard copy failed - use Copy button)"
    );
  });

  it('should return warning when transcript path is empty string', () => {
    const session: Session = {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      duration: 10,
      audio_path: '/path/to/audio.wav',
      transcript_path: '',
      preview: 'Test preview',
      clipboard_copied: false,
    };

    expect(determineRecordingStatus(session)).toBe(
      "⚠️ Recording saved (transcription failed - check Whisper setup)"
    );
  });

  it('should return warning when transcript path is missing', () => {
    const session: Session = {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      duration: 10,
      audio_path: '/path/to/audio.wav',
      preview: 'Test preview',
      clipboard_copied: false,
    };

    expect(determineRecordingStatus(session)).toBe(
      "⚠️ Recording saved (transcription failed - check Whisper setup)"
    );
  });
});

describe('findSessionById', () => {
  const sessions: Session[] = [
    {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      duration: 10,
      audio_path: '/path/to/audio1.wav',
      preview: 'Session 1',
      clipboard_copied: false,
    },
    {
      id: '2',
      timestamp: '2024-01-02T00:00:00Z',
      duration: 20,
      audio_path: '/path/to/audio2.wav',
      preview: 'Session 2',
      clipboard_copied: false,
    },
  ];

  it('should find session by id', () => {
    const result = findSessionById(sessions, '2');
    expect(result).toEqual(sessions[1]);
  });

  it('should return null if id not found', () => {
    const result = findSessionById(sessions, '999');
    expect(result).toBeNull();
  });

  it('should return null if id is null', () => {
    const result = findSessionById(sessions, null);
    expect(result).toBeNull();
  });

  it('should return null if sessions array is empty', () => {
    const result = findSessionById([], '1');
    expect(result).toBeNull();
  });
});

describe('autoSelectFirstSession', () => {
  const sessions: Session[] = [
    {
      id: '1',
      timestamp: '2024-01-01T00:00:00Z',
      duration: 10,
      audio_path: '/path/to/audio1.wav',
      preview: 'Session 1',
      clipboard_copied: false,
    },
    {
      id: '2',
      timestamp: '2024-01-02T00:00:00Z',
      duration: 20,
      audio_path: '/path/to/audio2.wav',
      preview: 'Session 2',
      clipboard_copied: false,
    },
  ];

  it('should select first session when none selected and sessions available', () => {
    const result = autoSelectFirstSession(sessions, null);
    expect(result).toBe('1');
  });

  it('should return current selection if already selected', () => {
    const result = autoSelectFirstSession(sessions, '2');
    expect(result).toBe('2');
  });

  it('should return null if sessions array is empty', () => {
    const result = autoSelectFirstSession([], null);
    expect(result).toBeNull();
  });

  it('should preserve current selection even if sessions available', () => {
    const result = autoSelectFirstSession(sessions, '2');
    expect(result).toBe('2');
  });
});

describe('handleRecordingCaptureFailed', () => {
  function makeCallbacks() {
    const calls = {
      setStatus: vi.fn(),
      setRecordingStatus: vi.fn(),
      setIsProcessing: vi.fn(),
      setRecordingDuration: vi.fn(),
      setSelectedId: vi.fn(),
      loadSessions: vi.fn().mockResolvedValue(undefined),
    };
    return calls;
  }

  const recoveredSession: Session = {
    id: 'recovered-1',
    timestamp: '2026-05-17T14:22:00Z',
    duration: 1985.6,
    audio_path: 'audio/recovered-1.wav',
    preview: '⚠️ Recording ended unexpectedly — audio saved, transcribe manually',
    clipboard_copied: false,
  };

  it('shows the saved-audio message and selects the recovered session', () => {
    const cb = makeCallbacks();
    const payload: RecordingCaptureFailedPayload = {
      reason: 'Audio stream error: Device disconnected',
      partial_duration_seconds: 1985.6,
      recovered_session: recoveredSession,
    };
    handleRecordingCaptureFailed(payload, cb);

    expect(cb.setRecordingStatus).toHaveBeenCalledWith('idle');
    expect(cb.setIsProcessing).toHaveBeenCalledWith(false);
    expect(cb.setRecordingDuration).toHaveBeenCalledWith(0);
    expect(cb.setStatus).toHaveBeenCalledTimes(1);
    const message = cb.setStatus.mock.calls[0][0];
    expect(message).toContain('Saved');
    expect(message).toContain('~33m 06s of audio');
    expect(message).toContain('Device disconnected');
    expect(cb.setSelectedId).toHaveBeenCalledWith('recovered-1');
    expect(cb.loadSessions).toHaveBeenCalledTimes(1);
  });

  it('shows the no-audio-recovered message when partial save failed', () => {
    const cb = makeCallbacks();
    const payload: RecordingCaptureFailedPayload = {
      reason: 'No microphone access',
      partial_duration_seconds: 0,
      recovered_session: null,
    };
    handleRecordingCaptureFailed(payload, cb);

    expect(cb.setRecordingStatus).toHaveBeenCalledWith('idle');
    expect(cb.setSelectedId).not.toHaveBeenCalled();
    const message = cb.setStatus.mock.calls[0][0];
    expect(message).toContain('no audio recovered');
    expect(message).toContain('No microphone access');
    expect(cb.loadSessions).toHaveBeenCalledTimes(1);
  });
});

// ===== Hook Tests =====

describe('useRecordingWorkflow', () => {
  const mockSessionService = {
    getSessions: vi.fn(),
  };

  const mockRecordingService = {
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    cancelRecording: vi.fn(),
    getRecordingDuration: vi.fn(),
    getRecordingStatus: vi.fn(),
    getRecordingFlushedThroughSeconds: vi.fn(),
  };

  const mockClipboardService = {
    copyTranscriptToClipboard: vi.fn(),
  };

  const mockTranscriptService = {
    loadTranscript: vi.fn(),
    retranscribe: vi.fn(),
  };

  const mockSessions: Session[] = [
    {
      id: 'session-1',
      timestamp: '2024-01-01T00:00:00Z',
      duration: 10,
      audio_path: '/path/to/audio1.wav',
      preview: 'Session 1',
      clipboard_copied: false,
    },
  ];

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      ApiProvider,
      {
        children,
        services: {
          sessionService: mockSessionService as any,
          recordingService: mockRecordingService as any,
          clipboardService: mockClipboardService as any,
          transcriptService: mockTranscriptService as any,
          transcriptionStatsService: {} as any,
          settingsService: {} as any,
          compressionService: {} as any,
          audioCueService: { playCue: vi.fn().mockResolvedValue(undefined) } as any,
          keyboardShortcutsService: {} as any,
        },
      }
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventListeners.clear();
    // Ensure mock is properly configured before each test
    mockSessionService.getSessions.mockClear();
    mockSessionService.getSessions.mockResolvedValue({ sessions: mockSessions });
    mockRecordingService.startRecording.mockClear();
    mockRecordingService.stopRecording.mockClear();
    mockRecordingService.pauseRecording.mockClear();
    mockRecordingService.resumeRecording.mockClear();
    mockRecordingService.cancelRecording.mockClear();
    mockRecordingService.getRecordingDuration.mockClear();
    mockRecordingService.getRecordingStatus.mockClear();
    mockRecordingService.getRecordingFlushedThroughSeconds.mockClear();
    // Default backend status agrees with the frontend's optimistic state so
    // existing tests don't see spurious drift corrections. Specific
    // reconciliation tests override this per-case.
    mockRecordingService.getRecordingStatus.mockResolvedValue('idle');
    // Streaming-writer trust signal: null while not recording, mock pretends
    // the writer hasn't flushed anything yet.
    mockRecordingService.getRecordingFlushedThroughSeconds.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers(); // Ensure real timers are restored
    mockEventListeners.clear();
  });

  it('should initialize with default state', async () => {
    const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

    await waitFor(() => {
      expect(result.current.recordingStatus).toBe('idle');
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.recordingDuration).toBe(0);
      expect(result.current.status).toBe('Ready to record');
    });
  });

  it('should load sessions on mount', async () => {
    const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

    await waitFor(() => {
      expect(mockSessionService.getSessions).toHaveBeenCalled();
      expect(result.current.sessions).toEqual(mockSessions);
    });
  });

  it('should auto-select first session on mount', async () => {
    const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

    await waitFor(() => {
      expect(result.current.selectedId).toBe('session-1');
      expect(result.current.selectedSession).toEqual(mockSessions[0]);
    });
  });

  it('should start recording successfully', async () => {
    mockRecordingService.startRecording.mockResolvedValue(undefined);
    // Backend mirrors the optimistic frontend transition so the
    // reconciliation tick (now running while in recording/paused) finds no
    // drift to correct.
    mockRecordingService.getRecordingStatus.mockResolvedValue('recording');
    const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

    await waitFor(() => {
      expect(result.current.sessions).toEqual(mockSessions);
    });

    await act(async () => {
      await result.current.handleStartRecording();
    });

    expect(mockRecordingService.startRecording).toHaveBeenCalled();
    expect(result.current.recordingStatus).toBe('recording');
    expect(result.current.status).toBe('⏺️ Recording...');
  });

  it('should handle start recording error', async () => {
    mockRecordingService.startRecording.mockRejectedValue(new Error('Start failed'));
    const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

    await waitFor(() => {
      expect(result.current.sessions).toEqual(mockSessions);
    });

    await act(async () => {
      await result.current.handleStartRecording();
    });

    expect(result.current.recordingStatus).toBe('idle');
    expect(result.current.status).toContain('❌ Error:');
  });

  it('should stop recording successfully with transcript', async () => {
    const initialSession: Session = {
      id: 'new-session',
      timestamp: '2024-01-02T00:00:00Z',
      duration: 15,
      audio_path: '/path/to/new-audio.wav',
      transcript_path: '',
      preview: 'Processing...',
      clipboard_copied: false,
    };

    const completedSession: Session = {
      ...initialSession,
      transcript_path: '/path/to/transcript.txt',
      preview: 'New session',
      clipboard_copied: true,
    };

    mockRecordingService.stopRecording.mockResolvedValue(initialSession);
    // After stop the backend transitions through processing; the
    // reconciliation tick no-ops on `'processing'`, so a fixed mock is fine.
    mockRecordingService.getRecordingStatus.mockResolvedValue('processing');
    const updatedSessions = [...mockSessions, completedSession];

    // Return original sessions first, then with processing session, then with completed
    mockSessionService.getSessions
      .mockResolvedValueOnce({ sessions: mockSessions })
      .mockResolvedValueOnce({ sessions: [...mockSessions, initialSession] })
      .mockResolvedValue({ sessions: updatedSessions });

    const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

    // Wait for initial load to complete
    await waitFor(() => {
      expect(result.current.sessions).toEqual(mockSessions);
    });

    // Flush any pending promises to ensure event listeners are set up
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.handleStopRecording();
    });

    expect(mockRecordingService.stopRecording).toHaveBeenCalled();
    expect(result.current.recordingStatus).toBe('processing');
    expect(result.current.isProcessing).toBe(true);
    expect(result.current.status).toBe('🔄 Saving audio and starting transcription...');
    expect(result.current.selectedId).toBe('new-session');

    // Simulate transcription complete event
    await act(async () => {
      emitMockEvent('transcription-complete', { session: completedSession });
      // Flush promises to ensure state updates propagate
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.recordingStatus).toBe('idle');
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.status).toBe('✅ Transcript copied to clipboard!');
    });

    // Note: Status resets to "Ready to record" after 5000ms timeout, but we don't test
    // this behavior as it requires fake timers which add complexity for minimal value
  });

  it('should handle stop recording error', async () => {
    mockRecordingService.stopRecording.mockRejectedValue(new Error('Stop failed'));
    const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

    // Wait for initial load to complete
    await waitFor(() => {
      expect(result.current.sessions).toEqual(mockSessions);
    });

    await act(async () => {
      await result.current.handleStopRecording();
    });

    expect(result.current.recordingStatus).toBe('idle');
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.status).toContain('❌ Error:');
  });

  it('should update recording duration while recording', async () => {
    mockRecordingService.startRecording.mockResolvedValue(undefined);
    mockRecordingService.getRecordingDuration.mockResolvedValue(5.5);
    mockRecordingService.getRecordingStatus.mockResolvedValue('recording');

    const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

    // Wait for initial load to complete
    await waitFor(() => {
      expect(result.current.sessions).toEqual(mockSessions);
    });

    await act(async () => {
      await result.current.handleStartRecording();
    });

    expect(result.current.recordingStatus).toBe('recording');

    // Wait for the interval to trigger (runs every 500ms).
    // Using waitFor with real timers is more reliable than fake timers.
    await waitFor(
      () => {
        expect(mockRecordingService.getRecordingDuration).toHaveBeenCalled();
        expect(result.current.recordingDuration).toBe(5.5);
      },
      { timeout: 2000 }
    );
  });

  it('should allow manual session selection', async () => {
    const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

    // Wait for initial load to complete
    await waitFor(() => {
      expect(result.current.sessions).toEqual(mockSessions);
    });

    act(() => {
      result.current.setSelectedId('session-1');
    });

    expect(result.current.selectedId).toBe('session-1');
  });

  it('should reload sessions when loadSessions is called', async () => {
    const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

    // Wait for initial load to complete
    await waitFor(() => {
      expect(result.current.sessions).toEqual(mockSessions);
    });

    const newSessions: Session[] = [
      ...mockSessions,
      {
        id: 'session-2',
        timestamp: '2024-01-03T00:00:00Z',
        duration: 20,
        audio_path: '/path/to/audio2.wav',
        preview: 'Session 2',
        clipboard_copied: false,
      },
    ];

    mockSessionService.getSessions.mockResolvedValue({ sessions: newSessions });

    await act(async () => {
      await result.current.loadSessions();
    });

    expect(result.current.sessions).toEqual(newSessions);
  });

  // Regression tests for the "paused recording disappears" bug: a background
  // transcription event firing for an *earlier* session must not yank the
  // user out of their in-flight recording/paused state.
  describe('stale transcription events during a new recording', () => {
    const staleCompletedSession: Session = {
      id: 'older-session',
      timestamp: '2024-01-01T00:00:00Z',
      duration: 10,
      audio_path: '/path/to/older.wav',
      transcript_path: '/path/to/older.txt',
      preview: 'Older transcript',
      clipboard_copied: true,
    };

    it('does not reset a paused recording when a stale completion arrives', async () => {
      mockRecordingService.startRecording.mockResolvedValue(undefined);
      mockRecordingService.pauseRecording.mockResolvedValue(undefined);
      // Backend agrees with the optimistic transition so the new
      // reconciliation tick stays silent during the stale-event scenario.
      mockRecordingService.getRecordingStatus.mockResolvedValue('paused');

      const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

      await waitFor(() => {
        expect(result.current.sessions).toEqual(mockSessions);
      });

      // Flush so the event listeners are wired up before we emit.
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.handleStartRecording();
      });
      await act(async () => {
        await result.current.handlePauseRecording();
      });

      expect(result.current.recordingStatus).toBe('paused');
      const statusWhilePaused = result.current.status;

      // Simulate a *prior* session's transcription completing in the
      // background while the user is paused.
      await act(async () => {
        emitMockEvent('transcription-complete', { session: staleCompletedSession });
        await Promise.resolve();
      });

      expect(result.current.recordingStatus).toBe('paused');
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.status).toBe(statusWhilePaused);
    });

    it('does not reset an active recording when a stale completion arrives', async () => {
      mockRecordingService.startRecording.mockResolvedValue(undefined);
      mockRecordingService.getRecordingStatus.mockResolvedValue('recording');

      const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

      await waitFor(() => {
        expect(result.current.sessions).toEqual(mockSessions);
      });

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.handleStartRecording();
      });

      expect(result.current.recordingStatus).toBe('recording');

      await act(async () => {
        emitMockEvent('transcription-complete', { session: staleCompletedSession });
        await Promise.resolve();
      });

      expect(result.current.recordingStatus).toBe('recording');
      expect(result.current.isProcessing).toBe(false);
    });

    it('does not reset a paused recording when a stale transcription error arrives', async () => {
      mockRecordingService.startRecording.mockResolvedValue(undefined);
      mockRecordingService.pauseRecording.mockResolvedValue(undefined);
      mockRecordingService.getRecordingStatus.mockResolvedValue('paused');

      const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

      await waitFor(() => {
        expect(result.current.sessions).toEqual(mockSessions);
      });

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.handleStartRecording();
      });
      await act(async () => {
        await result.current.handlePauseRecording();
      });

      const statusWhilePaused = result.current.status;

      await act(async () => {
        emitMockEvent('transcription-error', {
          session_id: staleCompletedSession.id,
          error: 'whisper failed',
        });
        await Promise.resolve();
      });

      expect(result.current.recordingStatus).toBe('paused');
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.status).toBe(statusWhilePaused);
    });

    it('still refreshes the session list when a stale completion arrives', async () => {
      mockRecordingService.startRecording.mockResolvedValue(undefined);
      mockRecordingService.pauseRecording.mockResolvedValue(undefined);
      mockRecordingService.getRecordingStatus.mockResolvedValue('paused');

      const refreshedSessions = [...mockSessions, staleCompletedSession];
      mockSessionService.getSessions
        .mockResolvedValueOnce({ sessions: mockSessions })
        .mockResolvedValue({ sessions: refreshedSessions });

      const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

      await waitFor(() => {
        expect(result.current.sessions).toEqual(mockSessions);
      });

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.handleStartRecording();
      });
      await act(async () => {
        await result.current.handlePauseRecording();
      });

      await act(async () => {
        emitMockEvent('transcription-complete', { session: staleCompletedSession });
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.sessions).toEqual(refreshedSessions);
      });
      expect(result.current.recordingStatus).toBe('paused');
    });
  });

  // Reconciliation against the backend's authoritative recording status: the
  // PRD requires that whatever async path drops the frontend out of sync,
  // backend truth pulls it back. These tests target the polling tick and the
  // mount-time one-shot.
  describe('backend status reconciliation', () => {
    it('restores the recording UI on mount when backend is still capturing', async () => {
      // Simulate a window reload while a recording was active: backend reports
      // `'recording'`, frontend starts at `'idle'`. The mount-time
      // reconciliation should restore the active state.
      mockRecordingService.getRecordingStatus.mockResolvedValue('recording');

      const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

      await waitFor(() => {
        expect(result.current.recordingStatus).toBe('recording');
        expect(result.current.status).toBe('⏺️ Recording...');
      });
    });

    it('restores the paused UI on mount when backend reports paused', async () => {
      mockRecordingService.getRecordingStatus.mockResolvedValue('paused');

      const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

      await waitFor(() => {
        expect(result.current.recordingStatus).toBe('paused');
        expect(result.current.status).toBe('⏸️ Recording paused');
      });
    });

    it('reconciles drift discovered during the active-state tick (paused -> recording)', async () => {
      // Frontend in `paused`, but the backend has somehow moved to `recording`
      // (e.g. an out-of-band resume). The 500 ms tick should mirror backend.
      mockRecordingService.startRecording.mockResolvedValue(undefined);
      mockRecordingService.pauseRecording.mockResolvedValue(undefined);
      mockRecordingService.getRecordingDuration.mockResolvedValue(0);

      // Mount agrees with idle, then we transition through start → pause...
      mockRecordingService.getRecordingStatus.mockResolvedValueOnce('idle');
      mockRecordingService.getRecordingStatus.mockResolvedValueOnce('paused');

      const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });
      await waitFor(() => {
        expect(result.current.sessions).toEqual(mockSessions);
      });

      await act(async () => { await Promise.resolve(); });
      await act(async () => { await result.current.handleStartRecording(); });
      await act(async () => { await result.current.handlePauseRecording(); });

      expect(result.current.recordingStatus).toBe('paused');

      // ...and now backend has drifted to `'recording'`. Subsequent polls
      // should reconcile.
      mockRecordingService.getRecordingStatus.mockResolvedValue('recording');

      await waitFor(
        () => {
          expect(result.current.recordingStatus).toBe('recording');
          expect(result.current.status).toBe('⏺️ Recording...');
        },
        { timeout: 2000 }
      );
    });

    it('announces unexpected end when backend goes idle while frontend believes recording', async () => {
      // The PRD case where capture ended out from under the UI: backend `idle`
      // while the frontend thinks `recording`. Reconciliation must surface a
      // warning, not silently pretend capture is still alive.
      mockRecordingService.startRecording.mockResolvedValue(undefined);
      mockRecordingService.getRecordingDuration.mockResolvedValue(0);
      // First poll on mount agrees with idle, second (after start) returns
      // `'recording'` so the initial tick does not announce. Then backend
      // drops to `'idle'`.
      mockRecordingService.getRecordingStatus
        .mockResolvedValueOnce('idle')
        .mockResolvedValueOnce('recording')
        .mockResolvedValue('idle');

      const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });
      await waitFor(() => {
        expect(result.current.sessions).toEqual(mockSessions);
      });

      await act(async () => { await Promise.resolve(); });
      await act(async () => { await result.current.handleStartRecording(); });
      expect(result.current.recordingStatus).toBe('recording');

      await waitFor(
        () => {
          expect(result.current.recordingStatus).toBe('idle');
          expect(result.current.status).toBe('⚠️ Recording ended unexpectedly');
        },
        { timeout: 2000 }
      );
    });

    it('handles recording-capture-failed event by resetting state and surfacing a warning', async () => {
      mockRecordingService.startRecording.mockResolvedValue(undefined);
      mockRecordingService.getRecordingStatus.mockResolvedValue('recording');

      const recovered: Session = {
        id: 'recovered-session',
        timestamp: '2026-05-17T14:22:00Z',
        duration: 95.0,
        audio_path: 'audio/recovered-session.wav',
        preview: '⚠️ Recording ended unexpectedly — audio saved, transcribe manually',
        clipboard_copied: false,
      };
      mockSessionService.getSessions
        .mockResolvedValueOnce({ sessions: mockSessions })
        .mockResolvedValue({ sessions: [...mockSessions, recovered] });

      const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });
      await waitFor(() => {
        expect(result.current.sessions).toEqual(mockSessions);
      });

      await act(async () => { await Promise.resolve(); });
      await act(async () => { await result.current.handleStartRecording(); });
      expect(result.current.recordingStatus).toBe('recording');

      // Backend's audio thread emits the capture-failed event.
      await act(async () => {
        emitMockEvent('recording-capture-failed', {
          reason: 'Audio stream error: Device disconnected',
          partial_duration_seconds: 95.4,
          recovered_session: recovered,
        });
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.recordingStatus).toBe('idle');
        expect(result.current.status).toContain('Recording stopped unexpectedly');
        expect(result.current.status).toContain('Device disconnected');
        expect(result.current.selectedId).toBe('recovered-session');
      });
    });

    it('no drift = no UI churn (idle ↔ idle stays silent)', async () => {
      mockRecordingService.getRecordingStatus.mockResolvedValue('idle');

      const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

      await waitFor(() => {
        expect(result.current.sessions).toEqual(mockSessions);
      });

      // No spurious status mutation from the mount-time check.
      expect(result.current.recordingStatus).toBe('idle');
      expect(result.current.status).toBe('Ready to record');
    });
  });
});

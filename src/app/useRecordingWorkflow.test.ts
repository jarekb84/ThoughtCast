import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { determineRecordingStatus, findSessionById, autoSelectFirstSession, useRecordingWorkflow } from './useRecordingWorkflow';
import { Session } from '../api';
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

// ===== Hook Tests =====

describe('useRecordingWorkflow', () => {
  const mockSessionService = {
    getSessions: vi.fn(),
  };

  const mockRecordingService = {
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    getRecordingDuration: vi.fn(),
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
    mockRecordingService.getRecordingDuration.mockClear();
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

    const { result } = renderHook(() => useRecordingWorkflow(), { wrapper });

    // Wait for initial load to complete
    await waitFor(() => {
      expect(result.current.sessions).toEqual(mockSessions);
    });

    await act(async () => {
      await result.current.handleStartRecording();
    });

    expect(result.current.recordingStatus).toBe('recording');

    // Wait for the interval to trigger (runs every 100ms)
    // Using waitFor with real timers is more reliable than fake timers
    await waitFor(() => {
      expect(mockRecordingService.getRecordingDuration).toHaveBeenCalled();
      expect(result.current.recordingDuration).toBe(5.5);
    });
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
});

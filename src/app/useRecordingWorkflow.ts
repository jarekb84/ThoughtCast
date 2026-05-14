import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Session,
  RecordingStatus,
  TranscriptionCompleteEvent,
  TranscriptionErrorEvent,
  SESSION_AUDIO_COMPRESSED,
  SessionAudioCompressedPayload,
  useApi,
} from '../api';
import { listen } from '@tauri-apps/api/event';
import { logger } from '../shared/utils/logger';
import { useRecordingCues } from '../features/audio-feedback/useRecordingCues';

/**
 * Determines appropriate status message based on recording result
 */
export function determineRecordingStatus(session: Session): string {
  if (session.transcript_path && session.transcript_path.length > 0) {
    if (session.clipboard_copied) {
      return "✅ Transcript copied to clipboard!";
    }
    return "⚠️ Transcription complete (clipboard copy failed - use Copy button)";
  }
  return "⚠️ Recording saved (transcription failed - check Whisper setup)";
}

/**
 * Finds session by ID or returns null
 */
export function findSessionById(sessions: Session[], id: string | null): Session | null {
  if (!id) return null;
  return sessions.find(s => s.id === id) || null;
}

/**
 * Selects the first session if none selected and sessions available
 */
export function autoSelectFirstSession(
  sessions: Session[],
  currentSelectedId: string | null
): string | null {
  if (sessions.length > 0 && !currentSelectedId) {
    return sessions[0].id;
  }
  return currentSelectedId;
}

/**
 * Handle transcription completion event
 */
export function handleTranscriptionComplete(
  session: Session,
  callbacks: {
    setStatus: (status: string) => void;
    setRecordingStatus: (status: RecordingStatus) => void;
    setIsProcessing: (processing: boolean) => void;
    loadSessions: () => Promise<void>;
    playReadyCue: () => void;
  }
): void {
  logger.info('Transcription completed:', session.id);

  // Determine and set appropriate status
  const resultStatus = determineRecordingStatus(session);
  callbacks.setStatus(resultStatus);

  // Update recording status to idle
  callbacks.setRecordingStatus('idle');
  callbacks.setIsProcessing(false);

  // Reload sessions to show updated transcript
  callbacks.loadSessions();

  // Fire-and-forget "ready" cue — advisory audio feedback that the transcript
  // is now on the clipboard. Failures here are non-fatal by design (handled
  // in the audio_cues Rust module).
  callbacks.playReadyCue();

  // Reset status after delay
  setTimeout(() => callbacks.setStatus('Ready to record'), 5000);
}

/**
 * Handle transcription error event
 */
export function handleTranscriptionError(
  sessionId: string,
  error: string,
  callbacks: {
    setStatus: (status: string) => void;
    setRecordingStatus: (status: RecordingStatus) => void;
    setIsProcessing: (processing: boolean) => void;
    loadSessions: () => Promise<void>;
  }
): void {
  logger.error('Transcription failed for session:', sessionId, error);

  callbacks.setStatus(`⚠️ Recording saved (transcription failed: ${error})`);
  callbacks.setRecordingStatus('idle');
  callbacks.setIsProcessing(false);

  // Reload sessions to show updated state
  callbacks.loadSessions();

  // Reset status after delay
  setTimeout(() => callbacks.setStatus('Ready to record'), 5000);
}

interface RecordingWorkflowState {
  sessions: Session[];
  selectedId: string | null;
  recordingStatus: RecordingStatus;
  /**
   * Live recording status as a ref, for consumers like the global-shortcut hook
   * that need to read the latest value from inside long-lived event listeners
   * without re-subscribing on every status change.
   */
  recordingStatusRef: React.RefObject<RecordingStatus>;
  isProcessing: boolean;
  recordingDuration: number;
  status: string;
  selectedSession: Session | null;
}

interface RecordingWorkflowActions {
  handleStartRecording: () => Promise<void>;
  handlePauseRecording: () => Promise<void>;
  handleResumeRecording: () => Promise<void>;
  handleCancelRecording: () => Promise<void>;
  handleStopRecording: () => Promise<void>;
  setSelectedId: (id: string | null) => void;
  loadSessions: () => Promise<void>;
}

/**
 * Custom hook managing the complete recording workflow
 *
 * Orchestrates:
 * - Session loading and selection
 * - Recording lifecycle (start/pause/resume/cancel/stop)
 * - Duration tracking
 * - Status message management
 */
export function useRecordingWorkflow(): RecordingWorkflowState & RecordingWorkflowActions {
  const { sessionService, recordingService } = useApi();
  const cues = useRecordingCues();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [status, setStatus] = useState("Ready to record");

  // Keep a live mirror of recordingStatus that long-lived listeners (e.g. the
  // global-shortcut hook) can read at event-fire time without re-subscribing.
  const recordingStatusRef = useRef<RecordingStatus>(recordingStatus);
  useEffect(() => {
    recordingStatusRef.current = recordingStatus;
  }, [recordingStatus]);

  const loadSessions = useCallback(async () => {
    try {
      const result = await sessionService.getSessions();
      setSessions(result.sessions);

      // Auto-select first session if none selected
      const newSelectedId = autoSelectFirstSession(result.sessions, selectedId);
      if (newSelectedId !== selectedId) {
        setSelectedId(newSelectedId);
      }
    } catch (error) {
      logger.error("Failed to load sessions:", error);
      setStatus(`Error: ${error}`);
    }
  }, [sessionService, selectedId]);

  const handleStartRecording = useCallback(async () => {
    try {
      // The start cue is blocking and must finish before microphone capture
      // begins, so the cue never bleeds into the recorded waveform (PRD edge
      // case 5). Cue failure does not block recording.
      await cues.playStart();
      await recordingService.startRecording();
      setRecordingStatus('recording');
      setStatus("⏺️ Recording...");
    } catch (error) {
      logger.error("Failed to start recording:", error);
      setStatus(`❌ Error: ${error}`);
    }
  }, [recordingService, cues]);

  const handlePauseRecording = useCallback(async () => {
    try {
      await recordingService.pauseRecording();
      setRecordingStatus('paused');
      setStatus("⏸️ Recording paused");
    } catch (error) {
      logger.error("Failed to pause recording:", error);
      setStatus(`❌ Error: ${error}`);
    }
  }, [recordingService]);

  const handleResumeRecording = useCallback(async () => {
    try {
      await recordingService.resumeRecording();
      setRecordingStatus('recording');
      setStatus("⏺️ Recording...");
    } catch (error) {
      logger.error("Failed to resume recording:", error);
      setStatus(`❌ Error: ${error}`);
    }
  }, [recordingService]);

  const handleCancelRecording = useCallback(async () => {
    try {
      await recordingService.cancelRecording();
      setRecordingStatus('idle');
      setRecordingDuration(0);
      setStatus("Recording cancelled");
      setTimeout(() => setStatus("Ready to record"), 3000);
    } catch (error) {
      logger.error("Failed to cancel recording:", error);
      setStatus(`❌ Error: ${error}`);
    }
  }, [recordingService]);

  const handleStopRecording = useCallback(async () => {
    try {
      // Stop cue fires *first*, on user intent, so the audible feedback is
      // instant rather than gated behind the WAV-save round-trip. Capture is
      // also winding down on the Rust side in parallel — there is no waveform
      // pollution risk because mic capture stops the moment stopRecording
      // executes, before the cue's first sample can reach the mic.
      cues.playStop();
      setRecordingStatus('processing');
      setIsProcessing(true);
      setStatus("🔄 Saving audio and starting transcription...");

      const newSession = await recordingService.stopRecording();

      // Session created with "Processing..." preview
      // Actual transcription happens in background
      // Events will update when complete

      // Reload sessions to show new session
      await loadSessions();
      setSelectedId(newSession.id);
    } catch (error) {
      logger.error("Failed to stop recording:", error);
      setStatus(`❌ Error: ${error}`);
      setRecordingStatus('idle');
      setIsProcessing(false);
    }
  }, [recordingService, loadSessions, cues]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for transcription events
  useEffect(() => {
    const setupListeners = async () => {
      // Create callback bundle for event handlers
      const callbacks = {
        setStatus,
        setRecordingStatus,
        setIsProcessing,
        loadSessions,
        playReadyCue: cues.playReady,
      };

      // Listen for successful transcription completion
      const unlistenComplete = await listen<TranscriptionCompleteEvent>(
        'transcription-complete',
        (event) => handleTranscriptionComplete(event.payload.session, callbacks)
      );

      // Listen for transcription errors
      const unlistenError = await listen<TranscriptionErrorEvent>(
        'transcription-error',
        (event) => handleTranscriptionError(event.payload.session_id, event.payload.error, callbacks)
      );

      // Listen for post-transcription audio compression: the session row's
      // audio_path changed and we want the UI to refresh that row.
      const unlistenCompressed = await listen<SessionAudioCompressedPayload>(
        SESSION_AUDIO_COMPRESSED,
        (event) => {
          logger.info(
            `Session ${event.payload.session_id} compressed; freed ${event.payload.bytes_freed} bytes`
          );
          void loadSessions();
        }
      );

      // Cleanup listeners on unmount
      return () => {
        unlistenComplete();
        unlistenError();
        unlistenCompressed();
      };
    };

    const cleanupPromise = setupListeners();

    return () => {
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [loadSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer for recording duration
  useEffect(() => {
    let interval: number | undefined;

    if (recordingStatus === 'recording' || recordingStatus === 'paused') {
      interval = window.setInterval(async () => {
        try {
          const duration = await recordingService.getRecordingDuration();
          setRecordingDuration(duration);
        } catch (error) {
          logger.error("Failed to get recording duration:", error);
        }
      }, 100);
    } else {
      setRecordingDuration(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recordingStatus, recordingService]);

  const selectedSession = findSessionById(sessions, selectedId);

  return {
    sessions,
    selectedId,
    recordingStatus,
    recordingStatusRef,
    isProcessing,
    recordingDuration,
    status,
    selectedSession,
    handleStartRecording,
    handlePauseRecording,
    handleResumeRecording,
    handleCancelRecording,
    handleStopRecording,
    setSelectedId,
    loadSessions,
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Session,
  RecordingStatus,
  TranscriptionCompleteEvent,
  TranscriptionErrorEvent,
  SESSION_AUDIO_COMPRESSED,
  SessionAudioCompressedPayload,
  RECORDING_CAPTURE_FAILED,
  RecordingCaptureFailedPayload,
  useApi,
} from '../api';
import { listen } from '@tauri-apps/api/event';
import { logger } from '../shared/utils/logger';
import { useDocumentActivity } from '../shared/utils/useDocumentActivity';
import { useRecordingCues } from '../features/audio-feedback/useRecordingCues';
import {
  detectStatusDrift,
  applyDriftAction,
  DriftCallbacks,
} from '../features/recording/recordingStatusDrift';
import {
  autoSelectFirstSession,
  findSessionById,
  handleRecordingCaptureFailed,
  handleTranscriptionComplete,
  handleTranscriptionError,
} from '../features/recording/workflowEventHandlers';

/**
 * Cadence (ms) for the idle-state drift watcher. While the frontend believes
 * recording is `'idle'`, we still want to catch the case where the backend is
 * actually mid-capture (the reported "top bar reverted" symptom) — but we
 * don't need the 500 ms timer cadence for that. 3 s keeps the heartbeat cheap
 * while shortening any drift window the user might notice.
 */
const IDLE_DRIFT_POLL_MS = 3000;

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
  /**
   * Seconds of audio the backend has durably committed to the in-flight
   * WAV's on-disk header (i.e. survives a crash from this point on). `null`
   * while no recording is active or the streaming writer has not yet flushed.
   */
  flushedThroughSeconds: number | null;
  status: string;
  selectedSession: Session | null;
}

interface RecordingWorkflowActions {
  handleStartRecording: () => Promise<void>;
  handlePauseRecording: () => Promise<void>;
  handleResumeRecording: () => Promise<void>;
  handleCancelRecording: () => Promise<void>;
  handleStopRecording: () => Promise<void>;
  handleRetranscribe: (sessionId: string) => Promise<void>;
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
  const { sessionService, recordingService, transcriptService } = useApi();
  const cues = useRecordingCues();
  const activity = useDocumentActivity();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [flushedThroughSeconds, setFlushedThroughSeconds] = useState<number | null>(null);
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

  const handleRetranscribe = useCallback(async (sessionId: string) => {
    // Drive the existing top-bar transcribing UI by flipping the same flags
    // `handleStopRecording` flips. The backend's async retranscribe pipeline
    // emits the same `transcription-complete` / `-error` events as a fresh
    // recording, so the existing event listeners (below) clear these flags
    // automatically when the work finishes — no separate state machine.
    try {
      setRecordingStatus('processing');
      setIsProcessing(true);
      setStatus("🔄 Re-transcribing audio...");

      await transcriptService.retranscribe(sessionId);

      // Pick up the session row's `preview: "Processing..."` marker so the
      // session list reflects the in-flight state immediately, instead of
      // waiting for the next event to refresh it.
      await loadSessions();
    } catch (error) {
      logger.error("Failed to start retranscription:", error);
      setStatus(`❌ Error: ${error}`);
      setRecordingStatus('idle');
      setIsProcessing(false);
    }
  }, [transcriptService, loadSessions]);

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
      // Create callback bundle for event handlers. `getRecordingStatus` is
      // a thunk over the live status ref so handlers see the current state
      // at event-fire time, not the state captured when this listener was
      // first installed — preventing a stale background transcription event
      // from clobbering an in-progress recording.
      const callbacks = {
        setStatus,
        setRecordingStatus,
        setIsProcessing,
        loadSessions,
        playReadyCue: cues.playReady,
        getRecordingStatus: () => recordingStatusRef.current,
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

      // Listen for capture-thread failures. The audio thread surfaces these
      // when the stream dies mid-recording (e.g. mic disconnected) or fails
      // to start. The handler resets workflow state and surfaces a visible
      // warning so the failure is no longer silent.
      const unlistenCaptureFailed = await listen<RecordingCaptureFailedPayload>(
        RECORDING_CAPTURE_FAILED,
        (event) =>
          handleRecordingCaptureFailed(event.payload, {
            setStatus,
            setRecordingStatus,
            setIsProcessing,
            setRecordingDuration,
            setSelectedId,
            loadSessions,
          })
      );

      // Cleanup listeners on unmount
      return () => {
        unlistenComplete();
        unlistenError();
        unlistenCompressed();
        unlistenCaptureFailed();
      };
    };

    const cleanupPromise = setupListeners();

    return () => {
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [loadSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drift-callback bundle used by both reconciliation paths (the active-state
  // tick and the idle-watcher) to apply backend truth to the workflow state.
  // Defined once so both effects share an identity-stable shape.
  const driftCallbacks: DriftCallbacks = {
    setRecordingStatus,
    setStatus,
    setIsProcessing,
    setRecordingDuration,
    loadSessions,
  };
  const driftCallbacksRef = useRef<DriftCallbacks>(driftCallbacks);
  useEffect(() => {
    driftCallbacksRef.current = driftCallbacks;
  });

  // Timer for recording duration. Display granularity is whole seconds
  // (MM:SS), so polling at 2 Hz keeps the timer visually current without
  // re-rendering the App tree 10x/sec — every tick rippled through React
  // reconciliation and forced a repaint of the timer span. Skip polling
  // entirely when the window is hidden: the timer is offscreen, and the
  // next interval tick after un-hide refreshes it within 500 ms.
  //
  // This tick also carries the active-state reconciliation: every duration
  // poll fetches the backend's `recording_status` and corrects any drift.
  // Backend is the source of truth, so a stale event or asynchronous signal
  // that flipped the frontend out of sync self-heals here.
  useEffect(() => {
    let interval: number | undefined;

    const isTimingRecording =
      recordingStatus === 'recording' || recordingStatus === 'paused';

    if (isTimingRecording && activity !== 'hidden') {
      interval = window.setInterval(async () => {
        try {
          const [backendStatus, duration, flushed] = await Promise.all([
            recordingService.getRecordingStatus(),
            recordingService.getRecordingDuration(),
            recordingService.getRecordingFlushedThroughSeconds(),
          ]);
          setRecordingDuration(duration);
          setFlushedThroughSeconds(flushed);
          const action = detectStatusDrift(recordingStatusRef.current, backendStatus);
          applyDriftAction(action, driftCallbacksRef.current);
        } catch (error) {
          logger.error("Failed to poll recording status/duration:", error);
        }
      }, 500);
    } else if (!isTimingRecording) {
      setRecordingDuration(0);
      setFlushedThroughSeconds(null);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recordingStatus, recordingService, activity]);

  // Idle-watcher: when the frontend believes it is `'idle'`, the fast active
  // tick above is not running, so a backend that is still capturing would
  // otherwise stay invisible to the UI. This is exactly the bug class the PRD
  // calls out — "top bar reverted to Record while the recording was still
  // going." Polling backend status every 3 s closes the window without
  // burning the IPC bus.
  //
  // We also explicitly skip this when frontend status is `'processing'`: the
  // transcription pipeline owns that state, and the backend briefly reports
  // `'idle'` once transcription finishes on its own thread — we don't want to
  // surface a false "recording ended unexpectedly" warning during that
  // handoff.
  useEffect(() => {
    if (recordingStatus !== 'idle' || activity === 'hidden') {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const backendStatus = await recordingService.getRecordingStatus();
        const action = detectStatusDrift(recordingStatusRef.current, backendStatus);
        applyDriftAction(action, driftCallbacksRef.current);
      } catch (error) {
        logger.error("Failed to poll recording status for idle drift:", error);
      }
    }, IDLE_DRIFT_POLL_MS);

    return () => clearInterval(interval);
  }, [recordingStatus, recordingService, activity]);

  // One-shot mount reconciliation: if a previous renderer/session left the
  // backend mid-recording (e.g. window reload, dev-mode HMR, or process
  // restart while the OS kept the audio thread alive), restore the UI to
  // backend truth before the user notices the empty top bar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const backendStatus = await recordingService.getRecordingStatus();
        if (cancelled) return;
        const action = detectStatusDrift(recordingStatusRef.current, backendStatus);
        applyDriftAction(action, driftCallbacksRef.current);
      } catch (error) {
        logger.error("Failed initial recording-status reconciliation:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSession = findSessionById(sessions, selectedId);

  return {
    sessions,
    selectedId,
    recordingStatus,
    recordingStatusRef,
    isProcessing,
    recordingDuration,
    flushedThroughSeconds,
    status,
    selectedSession,
    handleStartRecording,
    handlePauseRecording,
    handleResumeRecording,
    handleCancelRecording,
    handleStopRecording,
    handleRetranscribe,
    setSelectedId,
    loadSessions,
  };
}

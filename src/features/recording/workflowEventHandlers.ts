import {
  Session,
  RecordingStatus,
  RecordingCaptureFailedPayload,
} from '../../api';
import { logger } from '../../shared/utils/logger';
import { formatPartialDurationLabel } from './partialRecoveryLabel';

/**
 * Pure session/workflow helpers extracted from `useRecordingWorkflow` so the
 * hook file stays focused on React orchestration and so each helper can be
 * tested without mounting the hook.
 */

/**
 * Determines appropriate status message based on recording result.
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
 * Finds session by ID or returns null.
 */
export function findSessionById(sessions: Session[], id: string | null): Session | null {
  if (!id) return null;
  return sessions.find(s => s.id === id) || null;
}

/**
 * Selects the first session if none selected and sessions are available.
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
 * Handle transcription completion event.
 *
 * Background transcriptions (a prior recording or a user-triggered retranscribe)
 * can finish while the user is already in the middle of a *new* recording —
 * including paused. Without `getRecordingStatus`, this handler would
 * unconditionally flip `recordingStatus` to `'idle'` and wipe the in-progress
 * recording out of the UI even though the backend is still capturing it. We
 * gate the workflow-state mutations on actually being in `'processing'`; if
 * we're not, the event corresponds to background work and we only refresh
 * the session list (so the completed transcript appears in the sidebar).
 */
export function handleTranscriptionComplete(
  session: Session,
  callbacks: {
    setStatus: (status: string) => void;
    setRecordingStatus: (status: RecordingStatus) => void;
    setIsProcessing: (processing: boolean) => void;
    loadSessions: () => Promise<void>;
    playReadyCue: () => void;
    getRecordingStatus: () => RecordingStatus;
  }
): void {
  logger.info('Transcription completed:', session.id);

  // Always refresh the session list so the completed transcript shows up,
  // even if we shouldn't touch the recording state machine.
  callbacks.loadSessions();

  const currentStatus = callbacks.getRecordingStatus();
  if (currentStatus !== 'processing') {
    // A stale completion arrived while the user has already moved on (idle,
    // recording, or paused). Suppress the workflow reset and the audio cue —
    // playing it through speakers would bleed into the active mic capture.
    return;
  }

  const resultStatus = determineRecordingStatus(session);
  callbacks.setStatus(resultStatus);

  callbacks.setRecordingStatus('idle');
  callbacks.setIsProcessing(false);

  // Fire-and-forget "ready" cue — advisory audio feedback that the transcript
  // is now on the clipboard. Failures here are non-fatal by design (handled
  // in the audio_cues Rust module).
  callbacks.playReadyCue();

  // Reset status after delay
  setTimeout(() => callbacks.setStatus('Ready to record'), 5000);
}

/**
 * Handle a `recording-capture-failed` event from the audio capture thread.
 *
 * Composes the user-facing message and resets the workflow to idle. Backend
 * has already reset its own status to idle before emitting (see
 * `capture_failure.rs::propagate_capture_failure`), so the reconciliation
 * tick won't fight us here.
 *
 * Always refreshes the session list — when `recovered_session` is non-null,
 * the partial recording is already on disk and the user should see it appear
 * in the sidebar immediately.
 */
export function handleRecordingCaptureFailed(
  payload: RecordingCaptureFailedPayload,
  callbacks: {
    setStatus: (status: string) => void;
    setRecordingStatus: (status: RecordingStatus) => void;
    setIsProcessing: (processing: boolean) => void;
    setRecordingDuration: (duration: number) => void;
    setSelectedId: (id: string | null) => void;
    loadSessions: () => Promise<void>;
  }
): void {
  logger.error('Recording capture failed:', payload.reason);

  const durationLabel = formatPartialDurationLabel(payload.partial_duration_seconds);
  const message = payload.recovered_session
    ? `⚠️ Recording stopped unexpectedly. Saved ${durationLabel} — ${payload.reason}`
    : `⚠️ Recording stopped unexpectedly (no audio recovered) — ${payload.reason}`;

  callbacks.setStatus(message);
  callbacks.setRecordingStatus('idle');
  callbacks.setIsProcessing(false);
  callbacks.setRecordingDuration(0);

  // Always refresh — when the partial save succeeded, the new session needs
  // to appear in the sidebar immediately so the user can open + retranscribe.
  void callbacks.loadSessions();

  // Surface the recovered session in the viewer so the user lands on it
  // directly when they come back to the window.
  if (payload.recovered_session) {
    callbacks.setSelectedId(payload.recovered_session.id);
  }
}

/**
 * Handle transcription error event.
 *
 * Mirrors `handleTranscriptionComplete`'s gating: an error event from a
 * background transcription must not clobber a recording the user has already
 * started afterward. See that function's docstring for details.
 */
export function handleTranscriptionError(
  sessionId: string,
  error: string,
  callbacks: {
    setStatus: (status: string) => void;
    setRecordingStatus: (status: RecordingStatus) => void;
    setIsProcessing: (processing: boolean) => void;
    loadSessions: () => Promise<void>;
    getRecordingStatus: () => RecordingStatus;
  }
): void {
  logger.error('Transcription failed for session:', sessionId, error);

  callbacks.loadSessions();

  const currentStatus = callbacks.getRecordingStatus();
  if (currentStatus !== 'processing') {
    return;
  }

  callbacks.setStatus(`⚠️ Recording saved (transcription failed: ${error})`);
  callbacks.setRecordingStatus('idle');
  callbacks.setIsProcessing(false);

  setTimeout(() => callbacks.setStatus('Ready to record'), 5000);
}

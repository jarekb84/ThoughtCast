import { RecordingStatus } from "../../api";

/**
 * Corrective action the workflow should take when the frontend's optimistic
 * `recordingStatus` disagrees with the backend's authoritative state.
 *
 * Backend wins — the frontend mirrors the backend, never the other way around.
 * See `docs/PRD-recording-loss-prevention.md` for the motivation: stale events,
 * timer fires, or any other async signal that wipes the recording UI must
 * self-heal on the next reconciliation tick.
 */
export type DriftAction =
  | { kind: 'none' }
  | { kind: 'restore-from-backend'; backendStatus: 'recording' | 'paused' }
  | { kind: 'announce-unexpected-end' };

/**
 * Pure drift-detection: given the frontend's current `recordingStatus` and the
 * backend's authoritative status, return the corrective action the workflow
 * should apply.
 *
 * Reconciliation policy:
 *
 *   - frontend `idle` + backend `recording`/`paused` → **restore from backend**
 *     (the reported "top bar reverted to Record" symptom — something async
 *     dropped the UI to idle while capture is still running)
 *
 *   - frontend `recording`/`paused` + backend `idle` → **announce unexpected end**
 *     (the backend's recording ended out from under us — likely a capture-thread
 *     failure or an external stop. Surface it explicitly rather than silently
 *     pretending capture is still active.)
 *
 *   - frontend `recording` ↔ backend `paused` (or vice versa) → **mirror backend**
 *     (small disagreement, no warning — the UI just realigns)
 *
 *   - frontend `processing` → **no-op**
 *     (the transcription event listeners own this state; the backend may
 *     briefly report `idle` after async transcription completes, and we don't
 *     want to surface a false "recording ended" warning during that handoff.)
 *
 *   - all other combinations (notably both `idle` and frontend≡backend) →
 *     **no-op**
 */
export function detectStatusDrift(
  frontendStatus: RecordingStatus,
  backendStatus: RecordingStatus
): DriftAction {
  if (frontendStatus === 'processing') {
    return { kind: 'none' };
  }

  if (frontendStatus === backendStatus) {
    return { kind: 'none' };
  }

  const frontendIsActive = frontendStatus === 'recording' || frontendStatus === 'paused';
  const backendIsActive = backendStatus === 'recording' || backendStatus === 'paused';

  if (!frontendIsActive && backendIsActive) {
    return { kind: 'restore-from-backend', backendStatus: backendStatus as 'recording' | 'paused' };
  }

  if (frontendIsActive && backendStatus === 'idle') {
    return { kind: 'announce-unexpected-end' };
  }

  // Both active but differ (recording vs paused) — silently mirror.
  if (frontendIsActive && backendIsActive) {
    return { kind: 'restore-from-backend', backendStatus: backendStatus as 'recording' | 'paused' };
  }

  // Backend in `processing` while frontend is anything but `processing`: the
  // backend is finishing a stop the UI hasn't caught up to yet. The
  // `transcription-complete`/`-error` listeners will land us back at `idle`
  // when transcription finishes; no reconciliation needed here.
  return { kind: 'none' };
}

/**
 * Callback bundle used by `applyDriftAction` to reflect a drift correction in
 * the workflow hook's state. The shape mirrors the existing
 * `handleTranscriptionComplete` callbacks bag in `useRecordingWorkflow` so
 * both helpers compose with the same setters.
 */
export interface DriftCallbacks {
  setRecordingStatus: (status: RecordingStatus) => void;
  setStatus: (message: string) => void;
  setIsProcessing: (processing: boolean) => void;
  setRecordingDuration: (duration: number) => void;
  loadSessions: () => Promise<void>;
}

/**
 * Apply a `DriftAction` to the workflow's state via injected setters.
 *
 * Kept side-effect-free for the `none` arm so reconciliation ticks that find
 * no drift cause zero React re-renders.
 */
export function applyDriftAction(action: DriftAction, callbacks: DriftCallbacks): void {
  switch (action.kind) {
    case 'none':
      return;
    case 'restore-from-backend':
      callbacks.setRecordingStatus(action.backendStatus);
      callbacks.setStatus(
        action.backendStatus === 'paused'
          ? '⏸️ Recording paused'
          : '⏺️ Recording...'
      );
      return;
    case 'announce-unexpected-end':
      callbacks.setRecordingStatus('idle');
      callbacks.setIsProcessing(false);
      callbacks.setRecordingDuration(0);
      callbacks.setStatus('⚠️ Recording ended unexpectedly');
      void callbacks.loadSessions();
      return;
  }
}

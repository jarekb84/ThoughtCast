import { formatDuration } from '../../shared/formatters/duration';

/**
 * Pre-rendered label for the "Saved through MM:SS" trust signal shown below
 * the recording timer.
 *
 * Returns `null` when the indicator should be hidden — either because the
 * backend has not yet reported a value or because no audio has been durably
 * committed to disk. The component reads `display !== null` and renders nothing
 * in that case rather than dropping in an empty row.
 *
 * Co-located with the rest of the recording feature so the `.tsx` file stays
 * pure presentation per CLAUDE.md.
 */
export interface SavedThroughIndicatorDisplay {
  label: string;
  /** True when streaming has clearly fallen behind the timer by more than a
   *  few seconds — useful if the indicator wants to dim itself or surface a
   *  hint, but currently rendered identically to the healthy state. */
  isFalling: boolean;
}

const FALLING_BEHIND_SECONDS = 5;

export function deriveSavedThroughIndicator(
  flushedThroughSeconds: number | null,
  recordingDurationSeconds: number
): SavedThroughIndicatorDisplay | null {
  if (flushedThroughSeconds === null) {
    return null;
  }
  if (flushedThroughSeconds <= 0) {
    return null;
  }
  const label = `Saved through ${formatDuration(flushedThroughSeconds)}`;
  const lag = Math.max(0, recordingDurationSeconds - flushedThroughSeconds);
  return {
    label,
    isFalling: lag > FALLING_BEHIND_SECONDS,
  };
}

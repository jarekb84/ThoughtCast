/**
 * Format the duration component of the capture-failure status message.
 *
 * The failure path needs a different vocabulary than the live "Saved through"
 * trust signal: this one renders past-tense, rounded duration in plain
 * English ("~37s of audio") rather than the precise MM:SS the timer displays.
 * Co-located with the recording feature so the workflow hook stays focused
 * on orchestration.
 *
 * Returns whole seconds (rounded). When the rounded value is 0 it falls back
 * to a human-readable sentence so the failure message reads naturally even
 * when capture died before any audio arrived.
 */
export function formatPartialDurationLabel(partialDurationSeconds: number): string {
  const rounded = Math.max(0, Math.round(partialDurationSeconds));
  if (rounded === 0) {
    return "before any audio was captured";
  }
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  if (minutes === 0) {
    return `~${seconds}s of audio`;
  }
  return `~${minutes}m ${seconds.toString().padStart(2, '0')}s of audio`;
}

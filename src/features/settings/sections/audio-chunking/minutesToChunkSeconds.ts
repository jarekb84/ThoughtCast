/**
 * Convert a user-facing minutes value into the seconds the config layer
 * persists. The UI shows minutes (whole numbers feel natural for chunk
 * windows) but the Rust planner consumes seconds, so this is the single
 * conversion site for that boundary.
 *
 * Returns `null` for non-finite or non-positive inputs so the caller can
 * skip the form update without re-implementing the same guards inline.
 */
export function minutesToChunkSeconds(minutes: number): number | null {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return minutes * 60;
}

/**
 * Calculate progress percentage with smart capping
 *
 * Business logic for computing transcription progress:
 * - If no estimate: 0%
 * - If elapsed < estimate: linear progress up to 95%
 * - If elapsed > estimate: cap at 95% to avoid showing 100%
 *
 * The 95% cap prevents the progress bar from appearing "complete" when
 * estimates are exceeded, providing visual feedback that work is ongoing.
 *
 * @param elapsed - Elapsed time in seconds
 * @param estimated - Estimated total time in seconds (null if no estimate)
 * @returns Progress percentage (0-95)
 */
export function calculateProgressPercent(
  elapsed: number,
  estimated: number | null
): number {
  if (estimated === null || elapsed === 0) {
    return 0;
  }

  // Calculate linear progress
  const rawPercent = (elapsed / estimated) * 100;

  // Cap at 95% to handle estimates being exceeded
  return Math.min(rawPercent, 95);
}

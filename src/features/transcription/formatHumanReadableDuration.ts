/**
 * Format seconds into human-readable duration string
 *
 * Examples:
 * - 30 → "30 seconds"
 * - 65 → "1 minute"
 * - 150 → "2 minutes"
 * - 3720 → "1 hour 2 minutes"
 *
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatHumanReadableDuration(seconds: number): string {
  const roundedSeconds = Math.round(seconds);

  if (roundedSeconds < 60) {
    return `${roundedSeconds} second${roundedSeconds !== 1 ? 's' : ''}`;
  }

  const minutes = Math.floor(roundedSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    const hourStr = `${hours} hour${hours !== 1 ? 's' : ''}`;
    if (remainingMinutes > 0) {
      return `${hourStr} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    }
    return hourStr;
  }

  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

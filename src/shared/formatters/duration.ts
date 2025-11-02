/**
 * Format a duration in seconds to MM:SS format
 *
 * @param seconds - Duration in seconds
 * @returns Formatted string in MM:SS format (e.g., "3:45")
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

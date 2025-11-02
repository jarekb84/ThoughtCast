/**
 * Format an ISO timestamp to a full human-readable date/time string
 *
 * @param timestamp - ISO 8601 timestamp string
 * @returns Formatted string like "October 31, 2024, 3:45 PM"
 */
export function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return timestamp;
  }
}

/**
 * Format an ISO timestamp to a short date/time string
 *
 * @param timestamp - ISO 8601 timestamp string
 * @returns Formatted string like "Oct 31, 3:45 PM"
 */
export function formatShortTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return timestamp;
  }
}

/**
 * Format a byte count as a human-readable string ("1.2 GB", "23 MB", "512 KB").
 *
 * Uses 1024-based units (GB really meaning GiB) to match Windows Explorer's
 * convention so the numbers we display line up with what users see when
 * checking disk space themselves.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

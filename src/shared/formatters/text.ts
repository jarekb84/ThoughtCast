/**
 * Truncates text to a maximum length and adds ellipsis if needed
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation (default: 50)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.substring(0, maxLength)}...`;
}

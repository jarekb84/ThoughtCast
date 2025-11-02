/**
 * Shorten a file path for display by replacing home directory with ~
 *
 * @param path - Full file path
 * @returns Shortened path starting with ~/ThoughtCast/...
 */
export function formatFilePath(path: string): string {
  // Shorten path for display (replace home directory)
  return path.replace(/^.*?(ThoughtCast.*)/, "~/$1");
}

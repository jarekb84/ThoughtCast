import { TranscriptionProgress } from '../../api';

/**
 * Progress display data for UI rendering
 */
export interface ProgressDisplayData {
  /** Whether to show the progress section */
  shouldDisplay: boolean;
  /** Formatted estimated duration text */
  estimatedText: string;
  /** Formatted remaining time text (null if not applicable) */
  remainingText: string | null;
  /** Progress percentage for progress bar */
  progressPercent: number;
  /**
   * Chunk-position label like "chunk 2 of 3", or null when the recording is
   * unchunked. Surfaced alongside the time estimate so the user sees both
   * dimensions of progress at once.
   */
  chunkLabel: string | null;
}

/**
 * Prepare transcription progress data for display in UI
 *
 * Transforms raw progress data into formatted strings and display flags.
 * Encapsulates business rules for when/how to show progress information.
 *
 * @param progress - Raw transcription progress data
 * @param formatDuration - Function to format seconds into human-readable string
 * @returns Prepared display data ready for rendering
 */
export function prepareProgressDisplay(
  progress: TranscriptionProgress,
  formatDuration: (seconds: number) => string
): ProgressDisplayData {
  const chunkLabel = progress.chunkInfo
    ? `chunk ${progress.chunkInfo.current} of ${progress.chunkInfo.total}`
    : null;

  // Show the section whenever we have an estimate OR a chunk position. A
  // chunked recording may emit `chunk 1 of N` before the historical estimate
  // arrives, and the user wants to see that immediately.
  if (!progress.hasEstimate || progress.estimatedSeconds === null) {
    return {
      shouldDisplay: chunkLabel !== null,
      estimatedText: '',
      remainingText: null,
      progressPercent: 0,
      chunkLabel,
    };
  }

  const estimatedText = `~${formatDuration(progress.estimatedSeconds)}`;

  // Only show remaining time if we have a positive remaining duration
  const remainingText =
    progress.remainingSeconds !== null && progress.remainingSeconds > 0
      ? `(${formatDuration(progress.remainingSeconds)} remaining)`
      : null;

  return {
    shouldDisplay: true,
    estimatedText,
    remainingText,
    progressPercent: progress.progressPercent,
    chunkLabel,
  };
}

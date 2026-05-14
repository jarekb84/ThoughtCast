import { Session } from '../../../../api';

/**
 * Summary of how much overhead chunking has historically added per minute
 * of audio. Reported alongside the chunking toggle so the user can judge
 * whether the feature is worth keeping enabled.
 */
export interface ChunkingOverheadSummary {
  /**
   * Median analysis seconds per minute of audio across chunked sessions.
   * `null` when no chunked sessions exist yet.
   */
  averageOverheadPerMinute: number | null;
  /** Longest single analysis pass observed (seconds), or null when no data. */
  longestAnalysisSeconds: number | null;
  /** Duration (seconds) of the recording behind `longestAnalysisSeconds`. */
  longestAnalysisAudioSeconds: number | null;
  /** How many sessions contributed to the summary. */
  sampleCount: number;
}

const EMPTY_SUMMARY: ChunkingOverheadSummary = {
  averageOverheadPerMinute: null,
  longestAnalysisSeconds: null,
  longestAnalysisAudioSeconds: null,
  sampleCount: 0,
};

/**
 * Reduce session history into a chunking-overhead summary.
 *
 * Filters sessions that ran chunking (have `chunking_analysis_seconds` set)
 * and computes a median seconds-per-minute ratio plus the worst-case pass.
 * Median (rather than mean) so a one-off cold-cache spike doesn't drag the
 * displayed average up — same approach the transcription estimator uses.
 *
 * Pure: no I/O, no side effects, no formatting. Formatting and unit
 * conversion live in the UI layer.
 */
export function calculateChunkingOverheadSummary(
  sessions: readonly Session[]
): ChunkingOverheadSummary {
  const chunked = sessions.filter(
    (s) =>
      typeof s.chunking_analysis_seconds === 'number' &&
      s.chunking_analysis_seconds > 0 &&
      s.duration > 0
  );

  if (chunked.length === 0) {
    return EMPTY_SUMMARY;
  }

  const overheadRatios = chunked.map(
    (s) => (s.chunking_analysis_seconds as number) / (s.duration / 60)
  );

  const median = computeMedian(overheadRatios);

  // Worst-case observed analysis pass.
  let longest = chunked[0];
  for (const session of chunked) {
    if (
      (session.chunking_analysis_seconds ?? 0) >
      (longest.chunking_analysis_seconds ?? 0)
    ) {
      longest = session;
    }
  }

  return {
    averageOverheadPerMinute: median,
    longestAnalysisSeconds: longest.chunking_analysis_seconds ?? null,
    longestAnalysisAudioSeconds: longest.duration,
    sampleCount: chunked.length,
  };
}

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

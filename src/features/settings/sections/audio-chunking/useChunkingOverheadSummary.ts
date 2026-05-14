import { useEffect, useState } from 'react';
import { useApi } from '../../../../api';
import {
  calculateChunkingOverheadSummary,
  ChunkingOverheadSummary,
} from './calculateChunkingOverheadSummary';
import { logger } from '../../../../shared/utils/logger';

const EMPTY: ChunkingOverheadSummary = {
  averageOverheadPerMinute: null,
  longestAnalysisSeconds: null,
  longestAnalysisAudioSeconds: null,
  sampleCount: 0,
};

/**
 * Load the session index and reduce it to a chunking-overhead summary.
 *
 * The hook is intentionally one-shot per mount — the Settings panel only
 * opens occasionally and a fresh load on open is cheap. If a recording
 * finishes while the panel is open the numbers stay stale until the panel
 * is reopened; that's an acceptable trade-off compared to plumbing a
 * subscription through the session service.
 */
export function useChunkingOverheadSummary(): ChunkingOverheadSummary {
  const { sessionService } = useApi();
  const [summary, setSummary] = useState<ChunkingOverheadSummary>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const index = await sessionService.getSessions();
        if (cancelled) return;
        setSummary(calculateChunkingOverheadSummary(index.sessions));
      } catch (error) {
        logger.warn('Failed to load chunking overhead summary', error);
        // Leave summary as EMPTY; UI shows the "no data" placeholder.
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionService]);

  return summary;
}

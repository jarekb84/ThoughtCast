import { useEffect, useState, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  useApi,
  TranscriptionProgress,
  ChunkProgressInfo,
  TranscriptionProgressEvent,
} from '../../api';
import { calculateProgressPercent } from './calculateProgressPercent';

/**
 * Hook to track transcription progress with time estimates
 *
 * Fetches a historical time-based estimate and tracks elapsed time so the
 * UI can show a progress bar. Also subscribes to the `transcription-progress`
 * Tauri event so chunked recordings can surface "chunk N of M" while each
 * chunk's Whisper pass runs.
 *
 * @param isTranscribing - Whether transcription is currently active
 * @param audioDurationSeconds - Duration of the audio being transcribed
 * @returns Progress data including estimate, elapsed time, percentage, and
 *          chunk position (null for unchunked recordings).
 */
export function useTranscriptionProgress(
  isTranscribing: boolean,
  audioDurationSeconds: number
): TranscriptionProgress {
  const { transcriptionStatsService } = useApi();
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chunkInfo, setChunkInfo] = useState<ChunkProgressInfo | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch estimate when transcription starts
  useEffect(() => {
    if (!isTranscribing) {
      return;
    }

    let mounted = true;

    async function fetchEstimate() {
      try {
        const estimate = await transcriptionStatsService.getTranscriptionEstimate(
          audioDurationSeconds
        );
        if (mounted && estimate) {
          setEstimatedSeconds(estimate.estimatedSeconds);
        }
      } catch (error) {
        // Estimate fetch failed - continue without estimate
        console.warn('Failed to fetch transcription estimate:', error);
      }
    }

    fetchEstimate();

    return () => {
      mounted = false;
    };
  }, [isTranscribing, audioDurationSeconds, transcriptionStatsService]);

  // Track elapsed time while transcribing
  useEffect(() => {
    if (!isTranscribing) {
      // Reset when not transcribing
      startTimeRef.current = null;
      setElapsedSeconds(0);
      setEstimatedSeconds(null);
      setChunkInfo(null);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      return;
    }

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setElapsedSeconds(elapsed);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTranscribing]);

  // Subscribe to per-chunk progress events. Single-shot transcriptions never
  // fire this, so `chunkInfo` stays null and the UI shows the time-based
  // estimate only.
  useEffect(() => {
    if (!isTranscribing) return;

    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    listen<TranscriptionProgressEvent>('transcription-progress', (event) => {
      if (cancelled) return;
      setChunkInfo({
        current: event.payload.current,
        total: event.payload.total,
      });
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((error) => {
        console.warn('Failed to subscribe to transcription-progress:', error);
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [isTranscribing]);

  const progressPercent = calculateProgressPercent(
    elapsedSeconds,
    estimatedSeconds
  );

  const remainingSeconds =
    estimatedSeconds !== null
      ? Math.max(0, estimatedSeconds - elapsedSeconds)
      : null;

  return {
    estimatedSeconds,
    elapsedSeconds,
    progressPercent,
    hasEstimate: estimatedSeconds !== null,
    remainingSeconds,
    chunkInfo,
  };
}

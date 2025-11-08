import { useEffect, useState, useRef } from 'react';
import { useApi, TranscriptionProgress } from '../../api';
import { calculateProgressPercent } from './calculateProgressPercent';

/**
 * Hook to track transcription progress with time estimates
 *
 * Fetches historical estimates and tracks elapsed time to show progress.
 * Updates every second while transcription is active.
 *
 * @param isTranscribing - Whether transcription is currently active
 * @param audioDurationSeconds - Duration of the audio being transcribed
 * @returns Progress data including estimate, elapsed time, and percentage
 */
export function useTranscriptionProgress(
  isTranscribing: boolean,
  audioDurationSeconds: number
): TranscriptionProgress {
  const { transcriptionStatsService } = useApi();
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
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
        console.log(
          '[useTranscriptionProgress] Fetching estimate for audio duration:',
          audioDurationSeconds
        );
        const estimate = await transcriptionStatsService.getTranscriptionEstimate(
          audioDurationSeconds
        );

        console.log('[useTranscriptionProgress] Received estimate:', estimate);

        if (mounted && estimate) {
          setEstimatedSeconds(estimate.estimatedSeconds);
          console.log(
            '[useTranscriptionProgress] Set estimated seconds:',
            estimate.estimatedSeconds
          );
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

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      return;
    }

    // Start tracking time
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    // Update elapsed time every second
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

  // Calculate progress percentage
  const progressPercent = calculateProgressPercent(
    elapsedSeconds,
    estimatedSeconds
  );

  // Calculate remaining time
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
  };
}

import { useState, useEffect, useRef } from "react";
import { useApi } from "../../api";
import { RecordingStatus } from "../../api";
import { logger } from "../../shared/utils/logger";

/**
 * Hook to fetch and manage real-time audio levels during recording
 *
 * Polls the backend for audio level data every 50ms while recording is active.
 * Returns empty array when not recording or paused.
 */
export function useAudioLevels(recordingStatus: RecordingStatus): number[] {
  const { recordingService } = useApi();
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Only poll when actively recording (not idle or paused)
    if (recordingStatus !== "recording") {
      setAudioLevels([]);
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Start polling for audio levels
    const pollAudioLevels = async () => {
      try {
        const levels = await recordingService.getAudioLevels();
        setAudioLevels(levels);
      } catch (error) {
        logger.error("Failed to fetch audio levels:", error);
        // Don't clear existing levels on error, just log it
      }
    };

    // Initial fetch
    pollAudioLevels();

    // Poll every 50ms for smooth visualization
    intervalRef.current = window.setInterval(pollAudioLevels, 50);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [recordingStatus, recordingService]);

  return audioLevels;
}

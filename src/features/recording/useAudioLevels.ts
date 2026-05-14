import { useState, useEffect, useRef } from "react";
import { useApi } from "../../api";
import { RecordingStatus } from "../../api";
import { logger } from "../../shared/utils/logger";
import {
  DocumentActivity,
  useDocumentActivity,
} from "../../shared/utils/useDocumentActivity";

/**
 * Polling interval selected by current window-attention state.
 *
 * - `active`: window is focused, user is plausibly watching the visualization.
 *   100 ms feels responsive without rendering the canvas faster than the
 *   bars actually need to update.
 * - `idle`: window is visible but not focused (user is in another app).
 *   Coarser polling — the visualization is just a "mic is alive" signal at
 *   this point, fidelity does not matter.
 * - `hidden`: window is minimized or completely covered. Skip polling
 *   entirely — the canvas cannot be seen, every redraw is pure waste.
 */
const AUDIO_LEVEL_POLL_INTERVAL_MS: Record<DocumentActivity, number | null> = {
  active: 100,
  idle: 500,
  hidden: null,
};

export function selectAudioLevelPollInterval(
  activity: DocumentActivity
): number | null {
  return AUDIO_LEVEL_POLL_INTERVAL_MS[activity];
}

/**
 * Hook to fetch and manage real-time audio levels during recording.
 *
 * Polls the backend for audio level data while recording is active, with a
 * cadence that adapts to the window's user-attention state. Returns empty
 * array when not recording or paused; preserves the last known levels while
 * the window is hidden so the visualization does not flicker on un-hide.
 */
export function useAudioLevels(recordingStatus: RecordingStatus): number[] {
  const { recordingService } = useApi();
  const activity = useDocumentActivity();
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const intervalRef = useRef<number | null>(null);

  const pollInterval = selectAudioLevelPollInterval(activity);

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

    // Window is hidden — pause polling but keep the last levels in state so
    // the canvas does not flash blank when the user un-minimizes.
    if (pollInterval === null) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const pollAudioLevels = async () => {
      try {
        const levels = await recordingService.getAudioLevels();
        setAudioLevels(levels);
      } catch (error) {
        logger.error("Failed to fetch audio levels:", error);
        // Don't clear existing levels on error, just log it
      }
    };

    // Initial fetch on (re)start, so newly-active state shows fresh data
    // within one tick instead of waiting a full interval.
    pollAudioLevels();

    intervalRef.current = window.setInterval(pollAudioLevels, pollInterval);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [recordingStatus, recordingService, pollInterval]);

  return audioLevels;
}

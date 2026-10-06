import { useCallback } from "react";
import { useApi } from "../../api";
import { logger } from "../../shared/utils/logger";
import type { CueType } from "../settings/appConfig";

/**
 * Dispatchers for the frontend-driven recording cues (start and ready). The
 * stop cue is played by the backend's `stop_recording` command, right after
 * capture stops, so it can't race the microphone and end up in the recording.
 *
 * ## Why a dedicated hook
 *
 * Cues are advisory — every dispatcher must catch its own failures and never
 * propagate them up the recording pipeline (PRD edge case 7: "recording state
 * is the source of truth, cues are advisory"). The original implementation
 * lived inline in `useRecordingWorkflow` and repeated the same try/catch
 * shape three times — Rule of Three said "extract."
 *
 * ## Blocking vs. fire-and-forget
 *
 * - **Start cue is blocking** (PRD edge case 5): the cue plays out fully
 *   before microphone capture begins so it never bleeds onto the waveform.
 *   Callers `await` it.
 * - **Ready cue is fire-and-forget**: capture is long finished by then, and
 *   we don't want to block the UI on speaker output.
 *
 * Both are non-fatal — playback errors log a warning and resolve.
 */
export interface RecordingCueDispatchers {
  /** Awaitable; must complete before microphone capture begins. */
  playStart: () => Promise<void>;
  /** Fire-and-forget; advises the user transcription finished. */
  playReady: () => void;
}

export function useRecordingCues(): RecordingCueDispatchers {
  const { audioCueService } = useApi();

  const playStart = useCallback(async () => {
    try {
      await audioCueService.playCue("start");
    } catch (error) {
      logger.warn("Start cue playback failed (continuing recording):", error);
    }
  }, [audioCueService]);

  const playReady = useCallback(() => {
    void runFireAndForget(audioCueService.playCue("ready"), "ready");
  }, [audioCueService]);

  return { playStart, playReady };
}

function runFireAndForget(promise: Promise<void>, cue: CueType): Promise<void> {
  return promise.catch((error) => {
    logger.warn(`${cue} cue playback failed:`, error);
  });
}

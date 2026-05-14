import { useCallback, useEffect, useState } from "react";
import { useApi } from "../../../api";
import { useFilePicker } from "../useFilePicker";
import { logger } from "../../../shared/utils/logger";
import type {
  AudioFeedbackConfig,
  AudioFileValidation,
  CueType,
} from "../appConfig";

export type CuePathField = keyof Pick<
  AudioFeedbackConfig,
  "startCuePath" | "stopCuePath" | "readyCuePath"
>;

export interface AudioCueRowState {
  /** Path resolved by the Rust side for the bundled default of this cue. */
  defaultPath: string;
  /** Whether the row is currently pointing at the bundled default. */
  isUsingDefault: boolean;
  /** Validation message from the most recent Browse pick, if any. */
  validationMessage: string | null;
  /** Whether the most recent validation reported a usable file. */
  validationOk: boolean | null;
}

export interface AudioCueRowActions {
  handleBrowse: () => Promise<void>;
  handlePreview: () => Promise<void>;
  handleReset: () => void;
}

interface UseAudioCueRowOptions {
  cue: CueType;
  label: string;
  pathField: CuePathField;
  feedback: AudioFeedbackConfig;
  volume: number;
  onChange: (partial: Partial<AudioFeedbackConfig>) => void;
}

/**
 * Per-cue-row orchestration for the Audio Feedback settings section.
 *
 * Why this is a hook: the cue row needs to (a) ask the backend for the
 * bundled-default path on mount, (b) drive a file picker → validate →
 * setState sequence on Browse, (c) sequence preview playback against the
 * "is this default or custom" decision, and (d) clear validation state on
 * Reset. None of that belongs in a `.tsx` (React Separation doctrine).
 *
 * Behavior:
 *   - Default path fetch is cancellable so a fast unmount doesn't setState a
 *     ghost row.
 *   - Validation failures are warnings, not errors — the user can still try
 *     to save the path. Per PRD edge case 10 the backend silently falls back
 *     to the bundled default at playback time if the chosen file vanishes.
 *   - Preview never throws: an unplayable file logs a warning and returns.
 */
export function useAudioCueRow({
  cue,
  label,
  pathField,
  feedback,
  volume,
  onChange,
}: UseAudioCueRowOptions): AudioCueRowState & AudioCueRowActions {
  const { audioCueService } = useApi();
  const { pickFile } = useFilePicker();

  const [defaultPath, setDefaultPath] = useState<string>("");
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );
  const [validationOk, setValidationOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    audioCueService
      .getDefaultPath(cue)
      .then((p) => {
        if (!cancelled) setDefaultPath(p);
      })
      .catch((err) => logger.warn("getDefaultPath failed", err));
    return () => {
      cancelled = true;
    };
  }, [audioCueService, cue]);

  const currentPath = feedback[pathField];
  const isUsingDefault = currentPath.trim().length === 0;

  const handleBrowse = useCallback(async () => {
    const picked = await pickFile({
      title: `Choose a sound for "${label}"`,
      filters: [
        {
          name: "Audio",
          extensions: ["wav", "mp3", "ogg", "oga", "flac"],
        },
      ],
    });
    if (!picked) return;
    onChange({ [pathField]: picked } as Partial<AudioFeedbackConfig>);

    try {
      const v: AudioFileValidation = await audioCueService.validateFile(picked);
      setValidationOk(v.exists && v.format_ok && v.size_ok);
      setValidationMessage(v.message);
    } catch (err) {
      logger.warn("validateFile failed", err);
    }
  }, [pickFile, label, onChange, pathField, audioCueService]);

  const handlePreview = useCallback(async () => {
    try {
      const pathToPlay = isUsingDefault ? defaultPath : currentPath;
      if (!pathToPlay) return;
      await audioCueService.previewFile(pathToPlay, volume);
    } catch (err) {
      logger.warn("previewFile failed", err);
    }
  }, [isUsingDefault, defaultPath, currentPath, audioCueService, volume]);

  const handleReset = useCallback(() => {
    onChange({ [pathField]: "" } as Partial<AudioFeedbackConfig>);
    setValidationOk(null);
    setValidationMessage(null);
  }, [onChange, pathField]);

  return {
    defaultPath,
    isUsingDefault,
    validationMessage,
    validationOk,
    handleBrowse,
    handlePreview,
    handleReset,
  };
}

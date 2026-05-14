import { AppConfig, CHUNKING_LIMITS, COMPRESSION_AGE_OPTIONS } from "./appConfig";

/**
 * Settings-draft validation issues, keyed by either an `AppConfig` field name
 * or one of the named cross-field issues (`ageThreshold`, chunking bounds).
 */
type ChunkingFieldKey =
  | "chunkingMinDuration"
  | "chunkingMaxDuration"
  | "chunkingMinMaxOrder"
  | "chunkingSilenceThreshold"
  | "chunkingMinSilenceDuration";

export interface SettingsDraftIssues {
  /** Field-keyed issue messages — empty means valid. */
  fieldErrors: Partial<
    Record<keyof AppConfig | "ageThreshold" | ChunkingFieldKey, string>
  >;
  /** True when no field has a save-blocking issue. */
  isValid: boolean;
}

/**
 * Pure validation of a settings draft before save.
 *
 * Only flags issues that would corrupt persisted state. Missing path values
 * (Whisper, FFmpeg) are not save-blocking — the user might want to save other
 * fields and configure binaries later. Runtime features that need a binary
 * (compression, transcription) gracefully no-op or warn-log when the path is
 * empty, and the path picker's own validation status already shows a visual
 * cue ("Not validated" / "File does not exist").
 */
export function validateSettingsDraft(draft: AppConfig): SettingsDraftIssues {
  const fieldErrors: SettingsDraftIssues["fieldErrors"] = {};

  if (
    !COMPRESSION_AGE_OPTIONS.includes(
      draft.audioCompression.compressOldRecordingsOlderThanDays
    )
  ) {
    fieldErrors.ageThreshold = `Age threshold must be one of: ${COMPRESSION_AGE_OPTIONS.join(
      ", "
    )} days`;
  }

  const chunking = draft.audioChunking;
  const minBounds = CHUNKING_LIMITS.minChunkDurationSec;
  const maxBounds = CHUNKING_LIMITS.maxChunkDurationSec;
  const thresholdBounds = CHUNKING_LIMITS.silenceThresholdDb;
  const silenceBounds = CHUNKING_LIMITS.minSilenceDurationSec;

  if (
    chunking.minChunkDurationSec < minBounds.min ||
    chunking.minChunkDurationSec > minBounds.max
  ) {
    fieldErrors.chunkingMinDuration = `Min chunk duration must be ${minBounds.min}–${minBounds.max} sec`;
  }
  if (
    chunking.maxChunkDurationSec < maxBounds.min ||
    chunking.maxChunkDurationSec > maxBounds.max
  ) {
    fieldErrors.chunkingMaxDuration = `Max chunk duration must be ${maxBounds.min}–${maxBounds.max} sec`;
  }
  if (chunking.minChunkDurationSec >= chunking.maxChunkDurationSec) {
    fieldErrors.chunkingMinMaxOrder =
      "Min chunk duration must be less than max chunk duration";
  }
  if (
    chunking.silenceThresholdDb < thresholdBounds.min ||
    chunking.silenceThresholdDb > thresholdBounds.max
  ) {
    fieldErrors.chunkingSilenceThreshold = `Silence threshold must be ${thresholdBounds.min}–${thresholdBounds.max} dB`;
  }
  if (
    chunking.minSilenceDurationSec < silenceBounds.min ||
    chunking.minSilenceDurationSec > silenceBounds.max
  ) {
    fieldErrors.chunkingMinSilenceDuration = `Min silence duration must be ${silenceBounds.min}–${silenceBounds.max} sec`;
  }

  return {
    fieldErrors,
    isValid: Object.keys(fieldErrors).length === 0,
  };
}

/**
 * Pure dirty check between two settings drafts.
 *
 * Pulled out so the hook can reuse it both for the "you have unsaved changes"
 * indicator and for enabling/disabling the Save button.
 */
export function isSettingsDraftDirty(
  baseline: AppConfig,
  draft: AppConfig
): boolean {
  return JSON.stringify(baseline) !== JSON.stringify(draft);
}

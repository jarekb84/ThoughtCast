import { AppConfig, COMPRESSION_AGE_OPTIONS } from "./appConfig";

export interface SettingsDraftIssues {
  /** Field-keyed issue messages — empty means valid. */
  fieldErrors: Partial<Record<keyof AppConfig | "ageThreshold", string>>;
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

import {
  AppConfig,
  DEFAULT_APP_CONFIG,
  AudioCompressionConfig,
  AudioFeedbackConfig,
  KeyboardShortcutsConfig,
  AudioChunkingConfig,
} from "./appConfig";

/**
 * Fill in missing fields on a partial AppConfig coming from disk or the
 * backend, so the UI can always assume a fully-populated shape.
 *
 * Backend `serde(default)` already does this, but a freshly-installed user
 * has no `config.json` at all and `load_config` returns `AppConfig::default()`
 * — the merge here also defends against the (rare) case where a hand-edited
 * JSON file drops a section entirely.
 */
export function mergeConfigDefaults(
  partial: Partial<AppConfig> | null | undefined
): AppConfig {
  if (!partial) return { ...DEFAULT_APP_CONFIG };

  const compressionPartial = (partial.audioCompression ?? {}) as Partial<
    AudioCompressionConfig
  >;
  const shortcutsPartial = (partial.keyboardShortcuts ?? {}) as Partial<
    KeyboardShortcutsConfig
  >;
  const feedbackPartial = (partial.audioFeedback ?? {}) as Partial<
    AudioFeedbackConfig
  >;
  const chunkingPartial = (partial.audioChunking ?? {}) as Partial<
    AudioChunkingConfig
  >;

  return {
    whisperPath: partial.whisperPath ?? DEFAULT_APP_CONFIG.whisperPath,
    modelPath: partial.modelPath ?? DEFAULT_APP_CONFIG.modelPath,
    voiceNotesDir: partial.voiceNotesDir,
    ffmpegPath: partial.ffmpegPath ?? DEFAULT_APP_CONFIG.ffmpegPath,
    audioCompression: {
      compressNewRecordings:
        compressionPartial.compressNewRecordings ??
        DEFAULT_APP_CONFIG.audioCompression.compressNewRecordings,
      compressOldRecordingsEnabled:
        compressionPartial.compressOldRecordingsEnabled ??
        DEFAULT_APP_CONFIG.audioCompression.compressOldRecordingsEnabled,
      compressOldRecordingsOlderThanDays:
        compressionPartial.compressOldRecordingsOlderThanDays ??
        DEFAULT_APP_CONFIG.audioCompression.compressOldRecordingsOlderThanDays,
    },
    keyboardShortcuts: {
      recordShortcut:
        shortcutsPartial.recordShortcut ??
        DEFAULT_APP_CONFIG.keyboardShortcuts.recordShortcut,
      cancelShortcut:
        shortcutsPartial.cancelShortcut ??
        DEFAULT_APP_CONFIG.keyboardShortcuts.cancelShortcut,
      triggerMode:
        shortcutsPartial.triggerMode ??
        DEFAULT_APP_CONFIG.keyboardShortcuts.triggerMode,
    },
    audioFeedback: {
      enabled:
        feedbackPartial.enabled ?? DEFAULT_APP_CONFIG.audioFeedback.enabled,
      volume:
        feedbackPartial.volume ?? DEFAULT_APP_CONFIG.audioFeedback.volume,
      startCuePath:
        feedbackPartial.startCuePath ??
        DEFAULT_APP_CONFIG.audioFeedback.startCuePath,
      stopCuePath:
        feedbackPartial.stopCuePath ??
        DEFAULT_APP_CONFIG.audioFeedback.stopCuePath,
      readyCuePath:
        feedbackPartial.readyCuePath ??
        DEFAULT_APP_CONFIG.audioFeedback.readyCuePath,
    },
    audioChunking: {
      enabled:
        chunkingPartial.enabled ?? DEFAULT_APP_CONFIG.audioChunking.enabled,
      minChunkDurationSec:
        chunkingPartial.minChunkDurationSec ??
        DEFAULT_APP_CONFIG.audioChunking.minChunkDurationSec,
      maxChunkDurationSec:
        chunkingPartial.maxChunkDurationSec ??
        DEFAULT_APP_CONFIG.audioChunking.maxChunkDurationSec,
      silenceThresholdDb:
        chunkingPartial.silenceThresholdDb ??
        DEFAULT_APP_CONFIG.audioChunking.silenceThresholdDb,
      minSilenceDurationSec:
        chunkingPartial.minSilenceDurationSec ??
        DEFAULT_APP_CONFIG.audioChunking.minSilenceDurationSec,
    },
  };
}

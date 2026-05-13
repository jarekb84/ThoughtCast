import {
  AppConfig,
  DEFAULT_APP_CONFIG,
  AudioCompressionConfig,
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
  };
}

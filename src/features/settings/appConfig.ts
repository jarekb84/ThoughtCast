/**
 * Application configuration types, defaults, and shared constants — mirrors
 * `AppConfig` in `src-tauri/src/recording/models.rs`. Fields use camelCase to
 * match the JSON contract on disk and over the Tauri boundary.
 */
export interface AudioCompressionConfig {
  compressNewRecordings: boolean;
  compressOldRecordingsEnabled: boolean;
  compressOldRecordingsOlderThanDays: number;
}

export interface AppConfig {
  whisperPath: string;
  modelPath: string;
  voiceNotesDir?: string;
  ffmpegPath: string;
  audioCompression: AudioCompressionConfig;
}

export type PathKind = "executable" | "file" | "ffmpeg";

export interface PathValidation {
  exists: boolean;
  kind_ok: boolean;
  version: string | null;
  message: string;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  whisperPath: "",
  modelPath: "",
  ffmpegPath: "",
  audioCompression: {
    compressNewRecordings: true,
    compressOldRecordingsEnabled: false,
    compressOldRecordingsOlderThanDays: 7,
  },
};

export const COMPRESSION_AGE_OPTIONS: readonly number[] = [1, 7, 30];

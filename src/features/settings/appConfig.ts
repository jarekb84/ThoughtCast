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

/** How a press of the record shortcut behaves. */
export type TriggerMode = "toggle" | "push-to-talk";

export interface KeyboardShortcutsConfig {
  /**
   * Tauri global-shortcut accelerator string (e.g. "F1",
   * "CommandOrControl+Shift+R"). Parsed on the Rust side by Shortcut::from_str.
   */
  recordShortcut: string;
  /**
   * Accelerator that cancels a live recording. Registered globally **only
   * while a recording is active**, so the default "Escape" does not conflict
   * with text inputs on the OS when ThoughtCast is idle.
   */
  cancelShortcut: string;
  triggerMode: TriggerMode;
}

export interface AudioFeedbackConfig {
  enabled: boolean;
  /** 0.0 – 1.0; the Rust side clamps further if needed. */
  volume: number;
  /**
   * Absolute path to a custom cue file, or empty string to use the bundled
   * default at `<documents>/ThoughtCast/sounds/<cue>.wav`. The UI shows the
   * resolved default path as a placeholder when this is empty.
   */
  startCuePath: string;
  stopCuePath: string;
  readyCuePath: string;
}

export interface AppConfig {
  whisperPath: string;
  modelPath: string;
  voiceNotesDir?: string;
  ffmpegPath: string;
  audioCompression: AudioCompressionConfig;
  keyboardShortcuts: KeyboardShortcutsConfig;
  audioFeedback: AudioFeedbackConfig;
}

export type PathKind = "executable" | "file" | "ffmpeg";

export interface PathValidation {
  exists: boolean;
  kind_ok: boolean;
  version: string | null;
  message: string;
}

/** Which of the three cues a command refers to. Matches Rust's CueType enum. */
export type CueType = "start" | "stop" | "ready";

export interface AudioFileValidation {
  exists: boolean;
  format_ok: boolean;
  size_bytes: number;
  size_ok: boolean;
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
  keyboardShortcuts: {
    recordShortcut: "F1",
    cancelShortcut: "Escape",
    triggerMode: "toggle",
  },
  audioFeedback: {
    enabled: true,
    volume: 0.7,
    startCuePath: "",
    stopCuePath: "",
    readyCuePath: "",
  },
};

export const COMPRESSION_AGE_OPTIONS: readonly number[] = [1, 7, 30];

/** Minimum push-to-talk hold (ms) below which we treat the event as a no-op. */
export const PUSH_TO_TALK_MIN_HOLD_MS = 300;

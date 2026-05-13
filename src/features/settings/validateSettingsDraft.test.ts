import { describe, it, expect } from "vitest";
import {
  validateSettingsDraft,
  isSettingsDraftDirty,
} from "./validateSettingsDraft";
import { DEFAULT_APP_CONFIG, AppConfig } from "./appConfig";

function configWith(overrides: Partial<AppConfig>): AppConfig {
  return {
    ...DEFAULT_APP_CONFIG,
    ...overrides,
    audioCompression: {
      ...DEFAULT_APP_CONFIG.audioCompression,
      ...(overrides.audioCompression ?? {}),
    },
  };
}

describe("validateSettingsDraft", () => {
  it("is valid for fresh defaults (compression off, all paths empty)", () => {
    const result = validateSettingsDraft(DEFAULT_APP_CONFIG);
    expect(result.isValid).toBe(true);
    expect(result.fieldErrors).toEqual({});
  });

  it("does not block save when ffmpegPath is empty even with compression on", () => {
    // Missing ffmpeg is surfaced by the path-picker validation status, not by
    // a save-blocking error; the backend gracefully no-ops compression when
    // the path is empty.
    const result = validateSettingsDraft(
      configWith({
        audioCompression: {
          compressNewRecordings: true,
          compressOldRecordingsEnabled: true,
          compressOldRecordingsOlderThanDays: 7,
        },
      })
    );
    expect(result.isValid).toBe(true);
    expect(result.fieldErrors.ffmpegPath).toBeUndefined();
  });

  it("accepts compression on when ffmpegPath is set", () => {
    const result = validateSettingsDraft(
      configWith({
        ffmpegPath: "/bin/ffmpeg",
        audioCompression: {
          compressNewRecordings: true,
          compressOldRecordingsEnabled: true,
          compressOldRecordingsOlderThanDays: 7,
        },
      })
    );
    expect(result.isValid).toBe(true);
  });

  it("flags an age threshold not in the supported set", () => {
    const result = validateSettingsDraft(
      configWith({
        ffmpegPath: "/bin/ffmpeg",
        audioCompression: {
          compressNewRecordings: false,
          compressOldRecordingsEnabled: true,
          compressOldRecordingsOlderThanDays: 99,
        },
      })
    );
    expect(result.fieldErrors.ageThreshold).toBeDefined();
  });
});

describe("isSettingsDraftDirty", () => {
  it("is false when drafts match", () => {
    expect(
      isSettingsDraftDirty(DEFAULT_APP_CONFIG, { ...DEFAULT_APP_CONFIG })
    ).toBe(false);
  });

  it("is true when a top-level field differs", () => {
    expect(
      isSettingsDraftDirty(
        DEFAULT_APP_CONFIG,
        configWith({ whisperPath: "/new/path" })
      )
    ).toBe(true);
  });

  it("is true when a compression subfield differs", () => {
    // Default has compressNewRecordings true; flipping it should be dirty.
    expect(
      isSettingsDraftDirty(
        DEFAULT_APP_CONFIG,
        configWith({
          audioCompression: {
            compressNewRecordings: false,
            compressOldRecordingsEnabled: false,
            compressOldRecordingsOlderThanDays: 7,
          },
        })
      )
    ).toBe(true);
  });
});

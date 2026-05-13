import { describe, it, expect } from "vitest";
import { mergeConfigDefaults } from "./mergeConfigDefaults";
import { DEFAULT_APP_CONFIG } from "./appConfig";

describe("mergeConfigDefaults", () => {
  it("returns a fresh defaults object when given null", () => {
    const merged = mergeConfigDefaults(null);
    expect(merged).toEqual(DEFAULT_APP_CONFIG);
  });

  it("returns a fresh defaults object when given undefined", () => {
    const merged = mergeConfigDefaults(undefined);
    expect(merged).toEqual(DEFAULT_APP_CONFIG);
  });

  it("preserves provided top-level fields and fills the rest", () => {
    const merged = mergeConfigDefaults({
      whisperPath: "/bin/whisper",
      modelPath: "/m/base.bin",
    });

    expect(merged.whisperPath).toBe("/bin/whisper");
    expect(merged.modelPath).toBe("/m/base.bin");
    expect(merged.ffmpegPath).toBe("");
    expect(merged.audioCompression.compressOldRecordingsOlderThanDays).toBe(7);
  });

  it("fills missing compression fields when section is partial", () => {
    const merged = mergeConfigDefaults({
      audioCompression: {
        compressNewRecordings: true,
      } as never,
    });

    expect(merged.audioCompression.compressNewRecordings).toBe(true);
    expect(merged.audioCompression.compressOldRecordingsEnabled).toBe(false);
    expect(merged.audioCompression.compressOldRecordingsOlderThanDays).toBe(7);
  });

  it("does not mutate the input", () => {
    const input = { whisperPath: "/x" };
    const before = JSON.stringify(input);
    mergeConfigDefaults(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

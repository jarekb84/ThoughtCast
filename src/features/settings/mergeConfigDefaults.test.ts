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

  it("fills keyboard shortcut defaults when section is missing", () => {
    const merged = mergeConfigDefaults({ whisperPath: "/x" });
    expect(merged.keyboardShortcuts.recordShortcut).toBe("F1");
    expect(merged.keyboardShortcuts.cancelShortcut).toBe("Escape");
    expect(merged.keyboardShortcuts.triggerMode).toBe("toggle");
  });

  it("preserves provided keyboard shortcut overrides", () => {
    const merged = mergeConfigDefaults({
      keyboardShortcuts: {
        recordShortcut: "Alt+R",
        cancelShortcut: "Alt+X",
        triggerMode: "push-to-talk",
      },
    });
    expect(merged.keyboardShortcuts.recordShortcut).toBe("Alt+R");
    expect(merged.keyboardShortcuts.cancelShortcut).toBe("Alt+X");
    expect(merged.keyboardShortcuts.triggerMode).toBe("push-to-talk");
  });

  it("fills audio feedback defaults when section is missing", () => {
    const merged = mergeConfigDefaults({ whisperPath: "/x" });
    expect(merged.audioFeedback.enabled).toBe(true);
    expect(merged.audioFeedback.volume).toBeCloseTo(0.7);
    expect(merged.audioFeedback.startCuePath).toBe("");
  });

  it("preserves provided audio feedback overrides", () => {
    const merged = mergeConfigDefaults({
      audioFeedback: {
        enabled: false,
        volume: 0.25,
        startCuePath: "/custom/s.wav",
        stopCuePath: "",
        readyCuePath: "/custom/r.wav",
      },
    });
    expect(merged.audioFeedback.enabled).toBe(false);
    expect(merged.audioFeedback.volume).toBeCloseTo(0.25);
    expect(merged.audioFeedback.startCuePath).toBe("/custom/s.wav");
    expect(merged.audioFeedback.readyCuePath).toBe("/custom/r.wav");
  });
});

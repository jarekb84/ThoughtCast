import { describe, it, expect } from "vitest";
import { readConfigString } from "./readConfigString";
import { DEFAULT_APP_CONFIG } from "./appConfig";

describe("readConfigString", () => {
  const config = {
    ...DEFAULT_APP_CONFIG,
    whisperPath: "/bin/whisper-cli",
    transcription: { ...DEFAULT_APP_CONFIG.transcription, vadModelPath: "/m/silero.bin" },
  };

  it("reads a top-level field", () => {
    expect(readConfigString(config, "whisperPath")).toBe("/bin/whisper-cli");
  });

  it("reads a field inside a section", () => {
    expect(readConfigString(config, "transcription.vadModelPath")).toBe("/m/silero.bin");
  });

  it("returns empty for missing paths and non-string values", () => {
    expect(readConfigString(config, "nope")).toBe("");
    expect(readConfigString(config, "transcription.nope.deeper")).toBe("");
    expect(readConfigString(config, "transcription.repairRepetitions")).toBe("");
  });
});

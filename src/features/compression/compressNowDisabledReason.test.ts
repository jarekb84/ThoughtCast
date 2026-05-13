import { describe, it, expect } from "vitest";
import { resolveCompressNowDisabledReason } from "./compressNowDisabledReason";

describe("resolveCompressNowDisabledReason", () => {
  it("returns the FFmpeg prerequisite message when ffmpeg is not configured", () => {
    // Even if a batch were somehow already running, the missing prerequisite
    // takes precedence — the user's first problem to solve is configuration.
    expect(
      resolveCompressNowDisabledReason({
        ffmpegConfigured: false,
        isRunning: true,
        isStarting: true,
      })
    ).toBe("Configure FFmpeg path first");
  });

  it("returns the already-running message when a batch is running", () => {
    expect(
      resolveCompressNowDisabledReason({
        ffmpegConfigured: true,
        isRunning: true,
        isStarting: false,
      })
    ).toBe("A compression batch is already running");
  });

  it("returns the spinning-up message when start is in flight", () => {
    expect(
      resolveCompressNowDisabledReason({
        ffmpegConfigured: true,
        isRunning: false,
        isStarting: true,
      })
    ).toBe("Starting…");
  });

  it("returns undefined (enabled) when everything is ready", () => {
    expect(
      resolveCompressNowDisabledReason({
        ffmpegConfigured: true,
        isRunning: false,
        isStarting: false,
      })
    ).toBeUndefined();
  });

  it("prefers the running message over the starting message when both are true", () => {
    // `isStarting` flips true at the moment we invoke the service, and stays
    // that way until the service call resolves. `isRunning` flips true once
    // the backend has actually started a batch. There's a tiny overlap where
    // both can be true — the "already running" message is the more accurate
    // one to show.
    expect(
      resolveCompressNowDisabledReason({
        ffmpegConfigured: true,
        isRunning: true,
        isStarting: true,
      })
    ).toBe("A compression batch is already running");
  });
});

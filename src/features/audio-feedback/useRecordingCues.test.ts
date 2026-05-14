import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useRecordingCues } from "./useRecordingCues";
import { ApiProvider } from "../../api/ApiContext";
import { MockAudioCueService } from "./AudioCueService";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

function makeWrapper(audioCueService: MockAudioCueService) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      ApiProvider,
      {
        children,
        services: {
          audioCueService,
          // Other services are unused by this hook.
          sessionService: {} as any,
          recordingService: {} as any,
          transcriptService: {} as any,
          clipboardService: {} as any,
          transcriptionStatsService: {} as any,
          settingsService: {} as any,
          compressionService: {} as any,
          keyboardShortcutsService: {} as any,
        },
      }
    );
}

describe("useRecordingCues", () => {
  let mockService: MockAudioCueService;

  beforeEach(() => {
    mockService = new MockAudioCueService();
  });

  it("plays the start cue and awaits completion", async () => {
    const { result } = renderHook(() => useRecordingCues(), {
      wrapper: makeWrapper(mockService),
    });

    await act(async () => {
      await result.current.playStart();
    });

    expect(mockService.playCueCalls).toEqual(["start"]);
  });

  it("resolves the start cue even when playback rejects (advisory, never blocks recording)", async () => {
    const rejecting = new MockAudioCueService();
    rejecting.playCue = vi.fn().mockRejectedValue(new Error("no output device"));
    const { result } = renderHook(() => useRecordingCues(), {
      wrapper: makeWrapper(rejecting),
    });

    await act(async () => {
      // Must not throw — recording would be killed by an unhandled rejection.
      await expect(result.current.playStart()).resolves.toBeUndefined();
    });
  });

  it("fires stop cue without awaiting and swallows rejections", async () => {
    const rejecting = new MockAudioCueService();
    rejecting.playCue = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useRecordingCues(), {
      wrapper: makeWrapper(rejecting),
    });

    // Synchronous call site — must return void, not throw.
    expect(() => result.current.playStop()).not.toThrow();
    await act(async () => {
      // Let the swallowed-rejection microtask drain.
      await Promise.resolve();
    });
  });

  it("fires ready cue without awaiting and swallows rejections", async () => {
    const { result } = renderHook(() => useRecordingCues(), {
      wrapper: makeWrapper(mockService),
    });

    expect(() => result.current.playReady()).not.toThrow();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockService.playCueCalls).toEqual(["ready"]);
  });
});

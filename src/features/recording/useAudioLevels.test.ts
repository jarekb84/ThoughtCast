import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { selectAudioLevelPollInterval, useAudioLevels } from "./useAudioLevels";
import { ApiProvider, MockRecordingService } from "../../api";
import React from "react";

// Mock Tauri API
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("selectAudioLevelPollInterval", () => {
  it("returns 100 ms when the window is active", () => {
    expect(selectAudioLevelPollInterval("active")).toBe(100);
  });

  it("returns a slower interval when the window is idle", () => {
    const interval = selectAudioLevelPollInterval("idle");
    expect(interval).not.toBeNull();
    expect(interval!).toBeGreaterThan(100);
  });

  it("returns null (no polling) when the window is hidden", () => {
    expect(selectAudioLevelPollInterval("hidden")).toBeNull();
  });
});

describe("useAudioLevels", () => {
  let mockRecordingService: MockRecordingService;

  const originalVisibility = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "visibilityState"
  );
  const originalHasFocus = document.hasFocus;

  function setVisibility(value: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => value,
    });
  }

  function setHasFocus(value: boolean) {
    document.hasFocus = () => value;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mockRecordingService = new MockRecordingService();
    setVisibility("visible");
    setHasFocus(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (originalVisibility) {
      Object.defineProperty(Document.prototype, "visibilityState", originalVisibility);
    }
    document.hasFocus = originalHasFocus;
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      ApiProvider,
      {
        children,
        services: {
          recordingService: mockRecordingService,
          sessionService: undefined as any,
          transcriptService: undefined as any,
          clipboardService: undefined as any,
          transcriptionStatsService: {} as any,
          settingsService: {} as any,
          compressionService: {} as any,
          audioCueService: {} as any,
          keyboardShortcutsService: {} as any,
        },
      }
    );

  it("should return empty array when status is idle", () => {
    const { result } = renderHook(() => useAudioLevels("idle"), { wrapper });

    expect(result.current).toEqual([]);
  });

  it("should return empty array when status is paused", () => {
    const { result } = renderHook(() => useAudioLevels("paused"), { wrapper });

    expect(result.current).toEqual([]);
  });

  it("should call getAudioLevels when status is recording", async () => {
    const spy = vi.spyOn(mockRecordingService, "getAudioLevels");

    renderHook(() => useAudioLevels("recording"), { wrapper });

    // Wait for initial fetch
    await vi.advanceTimersByTimeAsync(20);

    expect(spy).toHaveBeenCalled();
  });

  it("should poll audio levels every 100ms when recording and active", async () => {
    const spy = vi.spyOn(mockRecordingService, "getAudioLevels");

    renderHook(() => useAudioLevels("recording"), { wrapper });

    // Initial fetch
    await vi.advanceTimersByTimeAsync(20);
    expect(spy).toHaveBeenCalledTimes(1);

    // After 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(spy).toHaveBeenCalledTimes(2);

    // After another 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("should stop polling when status changes from recording to paused", async () => {
    const spy = vi.spyOn(mockRecordingService, "getAudioLevels");

    const { rerender, result } = renderHook(
      ({ status }) =>
        useAudioLevels(status),
      {
        wrapper,
        initialProps: { status: "recording" as "idle" | "recording" | "paused" },
      }
    );

    // Initial fetch
    await vi.advanceTimersByTimeAsync(20);
    expect(spy).toHaveBeenCalledTimes(1);

    // Change to paused
    rerender({ status: "paused" });
    await vi.advanceTimersByTimeAsync(20);

    // Clear levels
    expect(result.current).toEqual([]);

    // Should not poll anymore
    const callCountBeforePause = spy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(200);
    expect(spy).toHaveBeenCalledTimes(callCountBeforePause);
  });

  it("should cleanup interval on unmount", async () => {
    const spy = vi.spyOn(mockRecordingService, "getAudioLevels");

    const { unmount } = renderHook(() => useAudioLevels("recording"), { wrapper });

    await vi.advanceTimersByTimeAsync(20);
    const callCountBeforeUnmount = spy.mock.calls.length;

    unmount();

    // Should not call after unmount
    await vi.advanceTimersByTimeAsync(200);
    expect(spy).toHaveBeenCalledTimes(callCountBeforeUnmount);
  });

  it("stops polling when the window becomes hidden, and resumes on un-hide", async () => {
    const spy = vi.spyOn(mockRecordingService, "getAudioLevels");

    renderHook(() => useAudioLevels("recording"), { wrapper });

    // Initial fetch on mount, plus one interval tick
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(100);
    const callCountBeforeHide = spy.mock.calls.length;
    expect(callCountBeforeHide).toBeGreaterThanOrEqual(2);

    // Hide the window — polling should stop
    await act(async () => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(spy).toHaveBeenCalledTimes(callCountBeforeHide);

    // Un-hide — polling resumes and fetches immediately
    await act(async () => {
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    await vi.advanceTimersByTimeAsync(20);
    expect(spy.mock.calls.length).toBeGreaterThan(callCountBeforeHide);
  });

  it("polls at the slower idle interval when the window loses focus", async () => {
    const spy = vi.spyOn(mockRecordingService, "getAudioLevels");

    renderHook(() => useAudioLevels("recording"), { wrapper });

    // Burn through the active-state initial fetch.
    await vi.advanceTimersByTimeAsync(20);

    // Blur the window — effect re-runs with the idle interval, firing one
    // immediate refetch and then ticking every 500 ms.
    await act(async () => {
      setHasFocus(false);
      window.dispatchEvent(new Event("blur"));
      await Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(20);

    const callCountAfterBlur = spy.mock.calls.length;

    // 100 ms (the old active interval) elapses — no idle tick has fired yet.
    await vi.advanceTimersByTimeAsync(100);
    expect(spy).toHaveBeenCalledTimes(callCountAfterBlur);

    // After the full idle interval elapses, a tick should have fired.
    await vi.advanceTimersByTimeAsync(500);
    expect(spy.mock.calls.length).toBeGreaterThan(callCountAfterBlur);
  });
});

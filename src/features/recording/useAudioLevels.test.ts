import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAudioLevels } from "./useAudioLevels";
import { ApiProvider, MockRecordingService } from "../../api";
import React from "react";

// Mock Tauri API
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("useAudioLevels", () => {
  let mockRecordingService: MockRecordingService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRecordingService = new MockRecordingService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  it("should poll audio levels every 50ms when recording", async () => {
    const spy = vi.spyOn(mockRecordingService, "getAudioLevels");

    renderHook(() => useAudioLevels("recording"), { wrapper });

    // Initial fetch
    await vi.advanceTimersByTimeAsync(20);
    expect(spy).toHaveBeenCalledTimes(1);

    // After 50ms
    await vi.advanceTimersByTimeAsync(50);
    expect(spy).toHaveBeenCalledTimes(2);

    // After another 50ms
    await vi.advanceTimersByTimeAsync(50);
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
    await vi.advanceTimersByTimeAsync(100);
    expect(spy).toHaveBeenCalledTimes(callCountBeforePause);
  });

  it("should cleanup interval on unmount", async () => {
    const spy = vi.spyOn(mockRecordingService, "getAudioLevels");

    const { unmount } = renderHook(() => useAudioLevels("recording"), { wrapper });

    await vi.advanceTimersByTimeAsync(20);
    const callCountBeforeUnmount = spy.mock.calls.length;

    unmount();

    // Should not call after unmount
    await vi.advanceTimersByTimeAsync(100);
    expect(spy).toHaveBeenCalledTimes(callCountBeforeUnmount);
  });
});

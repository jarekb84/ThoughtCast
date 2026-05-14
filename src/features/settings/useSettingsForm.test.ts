import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { useSettingsForm } from "./useSettingsForm";
import { MockSettingsService } from "./SettingsService";
import { ApiProvider } from "../../api";
import { DEFAULT_APP_CONFIG } from "./appConfig";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

function makeWrapper(settingsService: MockSettingsService) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      ApiProvider,
      {
        children,
        services: {
          sessionService: { getSessions: vi.fn() } as never,
          recordingService: {} as never,
          transcriptService: {} as never,
          clipboardService: {} as never,
          transcriptionStatsService: {} as never,
          settingsService,
          compressionService: {} as never,
          audioCueService: {} as never,
          keyboardShortcutsService: {} as never,
        },
      }
    );
}

describe("useSettingsForm", () => {
  let svc: MockSettingsService;

  beforeEach(() => {
    svc = new MockSettingsService();
  });

  it("loads existing config into baseline + draft on mount", async () => {
    svc.__setStored({
      ...DEFAULT_APP_CONFIG,
      whisperPath: "/seeded/whisper",
    });
    const { result } = renderHook(() => useSettingsForm(), {
      wrapper: makeWrapper(svc),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.draft.whisperPath).toBe("/seeded/whisper");
    });
    expect(result.current.isDirty).toBe(false);
  });

  it("tracks dirty when a field changes", async () => {
    const { result } = renderHook(() => useSettingsForm(), {
      wrapper: makeWrapper(svc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setField("whisperPath", "/edited"));

    expect(result.current.isDirty).toBe(true);
    expect(result.current.draft.whisperPath).toBe("/edited");
  });

  it("cancel reverts draft to baseline", async () => {
    const { result } = renderHook(() => useSettingsForm(), {
      wrapper: makeWrapper(svc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setField("ffmpegPath", "/edited/ffmpeg"));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.cancel());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.draft.ffmpegPath).toBe("");
  });

  it("save promotes draft into baseline and clears dirty", async () => {
    const { result } = renderHook(() => useSettingsForm(), {
      wrapper: makeWrapper(svc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setField("whisperPath", "/saved"));

    let outcome: { ok: boolean } = { ok: false };
    await act(async () => {
      outcome = await result.current.save();
    });

    expect(outcome.ok).toBe(true);
    expect(result.current.isDirty).toBe(false);
    expect(svc.__getStored().whisperPath).toBe("/saved");
  });

  it("setCompressionField updates nested compression state", async () => {
    const { result } = renderHook(() => useSettingsForm(), {
      wrapper: makeWrapper(svc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() =>
      result.current.setCompressionField("compressNewRecordings", true)
    );
    expect(result.current.draft.audioCompression.compressNewRecordings).toBe(
      true
    );
  });

  it("revalidatePath stores the validation result", async () => {
    const { result } = renderHook(() => useSettingsForm(), {
      wrapper: makeWrapper(svc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setField("ffmpegPath", "/bin/ffmpeg"));

    await act(async () => {
      await result.current.revalidatePath("ffmpegPath", "ffmpeg");
    });

    const status = result.current.pathValidations["ffmpegPath"];
    expect(status?.state).toBe("result");
    if (status?.state === "result") {
      expect(status.result.exists).toBe(true);
      expect(status.result.version).toBe("mock-6.0");
    }
  });

  it("stays valid for fresh defaults even with compression on and ffmpeg empty", async () => {
    // Default has compress-new on with ffmpegPath empty. The path picker's
    // own status field surfaces the missing-binary state visually; we don't
    // block save on it.
    const { result } = renderHook(() => useSettingsForm(), {
      wrapper: makeWrapper(svc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.draft.audioCompression.compressNewRecordings).toBe(
      true
    );
    expect(result.current.draft.ffmpegPath).toBe("");
    expect(result.current.isValid).toBe(true);
    expect(result.current.fieldErrors.ffmpegPath).toBeUndefined();
  });
});

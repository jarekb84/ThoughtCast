import { describe, it, expect, vi, beforeEach } from "vitest";
import { TauriSettingsService, MockSettingsService } from "./SettingsService";
import { DEFAULT_APP_CONFIG } from "./appConfig";
import { ApiError } from "../../api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("TauriSettingsService", () => {
  let service: TauriSettingsService;
  let mockInvoke: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    service = new TauriSettingsService();
    const { invoke } = await import("@tauri-apps/api/core");
    mockInvoke = invoke as ReturnType<typeof vi.fn>;
    vi.clearAllMocks();
  });

  describe("loadConfig", () => {
    it("returns merged defaults when backend returns partial data", async () => {
      mockInvoke.mockResolvedValue({
        whisperPath: "/bin/whisper",
        modelPath: "/m/base.bin",
      });
      const config = await service.loadConfig();
      expect(config.whisperPath).toBe("/bin/whisper");
      expect(config.ffmpegPath).toBe("");
      expect(config.audioCompression.compressOldRecordingsOlderThanDays).toBe(7);
    });

    it("returns defaults when backend returns nothing", async () => {
      mockInvoke.mockResolvedValue(null);
      const config = await service.loadConfig();
      expect(config).toEqual(DEFAULT_APP_CONFIG);
    });

    it("wraps backend errors in ApiError", async () => {
      mockInvoke.mockRejectedValue(new Error("disk read failure"));
      await expect(service.loadConfig()).rejects.toThrow(ApiError);
      await expect(service.loadConfig()).rejects.toThrow("Failed to load settings");
    });
  });

  describe("saveConfig", () => {
    it("forwards the config in `config` named arg", async () => {
      mockInvoke.mockResolvedValue(undefined);
      await service.saveConfig(DEFAULT_APP_CONFIG);
      expect(mockInvoke).toHaveBeenCalledWith("save_config", {
        config: DEFAULT_APP_CONFIG,
      });
    });

    it("wraps save errors", async () => {
      mockInvoke.mockRejectedValue(new Error("permission denied"));
      await expect(service.saveConfig(DEFAULT_APP_CONFIG)).rejects.toThrow(
        "Failed to save settings"
      );
    });
  });

  describe("validatePath", () => {
    it("forwards path and kind", async () => {
      mockInvoke.mockResolvedValue({
        exists: true,
        kind_ok: true,
        version: "6.1",
        message: "FFmpeg detected (6.1)",
      });
      const v = await service.validatePath("/bin/ffmpeg", "ffmpeg");
      expect(mockInvoke).toHaveBeenCalledWith("validate_config_path", {
        path: "/bin/ffmpeg",
        kind: "ffmpeg",
      });
      expect(v.version).toBe("6.1");
    });
  });
});

describe("MockSettingsService", () => {
  it("persists across loadConfig / saveConfig calls", async () => {
    const svc = new MockSettingsService();
    const updated = {
      ...DEFAULT_APP_CONFIG,
      whisperPath: "/mock/whisper",
      ffmpegPath: "/mock/ffmpeg",
    };
    await svc.saveConfig(updated);
    const loaded = await svc.loadConfig();
    expect(loaded.whisperPath).toBe("/mock/whisper");
    expect(loaded.ffmpegPath).toBe("/mock/ffmpeg");
  });

  it("rejects empty paths in validatePath", async () => {
    const svc = new MockSettingsService();
    const v = await svc.validatePath("", "executable");
    expect(v.exists).toBe(false);
  });

  it("simulates ffmpeg version detection", async () => {
    const svc = new MockSettingsService();
    const v = await svc.validatePath("/some/ffmpeg", "ffmpeg");
    expect(v.version).toBe("mock-6.0");
  });
});

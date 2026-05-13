import { wrapTauriInvoke } from "../../api/services/tauriInvokeWrapper";
import {
  AppConfig,
  DEFAULT_APP_CONFIG,
  PathKind,
  PathValidation,
} from "./appConfig";
import { mergeConfigDefaults } from "./mergeConfigDefaults";

/**
 * Settings persistence service — owns the round-trip with `config.json`
 * via the Tauri layer.
 */
export interface ISettingsService {
  /** Load current config from disk; returns defaults if not yet saved. */
  loadConfig(): Promise<AppConfig>;
  /** Save the provided config to disk, atomically. */
  saveConfig(config: AppConfig): Promise<void>;
  /** Probe a single path for validity per the given kind. */
  validatePath(path: string, kind: PathKind): Promise<PathValidation>;
}

export class TauriSettingsService implements ISettingsService {
  async loadConfig(): Promise<AppConfig> {
    const raw = await wrapTauriInvoke<Partial<AppConfig> | null>(
      "load_config",
      undefined,
      "Failed to load settings",
      "SETTINGS_LOAD_FAILED"
    );
    return mergeConfigDefaults(raw);
  }

  async saveConfig(config: AppConfig): Promise<void> {
    return wrapTauriInvoke<void>(
      "save_config",
      { config },
      "Failed to save settings",
      "SETTINGS_SAVE_FAILED"
    );
  }

  async validatePath(path: string, kind: PathKind): Promise<PathValidation> {
    return wrapTauriInvoke<PathValidation>(
      "validate_config_path",
      { path, kind },
      "Failed to validate path",
      "SETTINGS_VALIDATE_FAILED"
    );
  }
}

/**
 * Mock for tests and Storybook-style harnesses.
 */
export class MockSettingsService implements ISettingsService {
  private stored: AppConfig = { ...DEFAULT_APP_CONFIG };

  async loadConfig(): Promise<AppConfig> {
    await new Promise((r) => setTimeout(r, 10));
    return { ...this.stored };
  }

  async saveConfig(config: AppConfig): Promise<void> {
    await new Promise((r) => setTimeout(r, 10));
    this.stored = { ...config };
  }

  async validatePath(path: string, kind: PathKind): Promise<PathValidation> {
    await new Promise((r) => setTimeout(r, 5));
    if (path.trim() === "") {
      return {
        exists: false,
        kind_ok: false,
        version: null,
        message: "Path is empty",
      };
    }
    // Treat any non-empty path as "valid" in the mock, so test setups don't
    // need to seed a real filesystem.
    const version = kind === "ffmpeg" ? "mock-6.0" : null;
    return {
      exists: true,
      kind_ok: true,
      version,
      message: kind === "ffmpeg" ? "FFmpeg detected (mock-6.0)" : "File found",
    };
  }

  // Test helpers
  __setStored(config: AppConfig) {
    this.stored = { ...config };
  }
  __getStored(): AppConfig {
    return { ...this.stored };
  }
}

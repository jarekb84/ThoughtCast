import type { AppConfig } from "./appConfig";

/**
 * Read a string field from the config by key or dotted path
 * ("whisperPath", "transcription.vadModelPath"). Path fields are validated by
 * name, and some live inside config sections. Anything missing or non-string
 * reads as "".
 */
export function readConfigString(config: AppConfig, path: string): string {
  let value: unknown = config;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object") return "";
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === "string" ? value : "";
}

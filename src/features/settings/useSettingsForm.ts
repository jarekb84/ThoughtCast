import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppConfig,
  DEFAULT_APP_CONFIG,
  PathKind,
  PathValidation,
} from "./appConfig";
import { useApi } from "../../api";
import {
  isSettingsDraftDirty,
  validateSettingsDraft,
} from "./validateSettingsDraft";
import { logger } from "../../shared/utils/logger";

export type ValidationStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "result"; result: PathValidation };

export interface SettingsFormState {
  draft: AppConfig;
  baseline: AppConfig;
  isLoading: boolean;
  isSaving: boolean;
  loadError: string | null;
  saveError: string | null;
  isDirty: boolean;
  isValid: boolean;
  fieldErrors: ReturnType<typeof validateSettingsDraft>["fieldErrors"];
  pathValidations: Record<string, ValidationStatus>;
}

export interface SettingsFormActions {
  setField: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  setCompressionField: <K extends keyof AppConfig["audioCompression"]>(
    key: K,
    value: AppConfig["audioCompression"][K]
  ) => void;
  revalidatePath: (pathField: string, kind: PathKind) => Promise<void>;
  save: () => Promise<{ ok: boolean }>;
  cancel: () => void;
  reload: () => Promise<void>;
}

/**
 * Orchestrates the Settings panel: load → edit → validate → save → close.
 *
 * Why a hook (rather than open-coded in the component): every transition here
 * — dirty tracking, debounced validation, save sequencing — is logic that
 * must not live in JSX per the React Separation doctrine.
 */
export function useSettingsForm(): SettingsFormState & SettingsFormActions {
  const { settingsService } = useApi();
  const [baseline, setBaseline] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [draft, setDraft] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pathValidations, setPathValidations] = useState<
    Record<string, ValidationStatus>
  >({});

  const validationSequenceRef = useRef<Record<string, number>>({});

  const reload = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const config = await settingsService.loadConfig();
      setBaseline(config);
      setDraft(config);
    } catch (error) {
      logger.error("Failed to load settings", error);
      setLoadError(
        error instanceof Error ? error.message : "Failed to load settings"
      );
    } finally {
      setIsLoading(false);
    }
  }, [settingsService]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setField = useCallback(
    <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const setCompressionField = useCallback(
    <K extends keyof AppConfig["audioCompression"]>(
      key: K,
      value: AppConfig["audioCompression"][K]
    ) => {
      setDraft((prev) => ({
        ...prev,
        audioCompression: { ...prev.audioCompression, [key]: value },
      }));
    },
    []
  );

  const revalidatePath = useCallback(
    async (pathField: string, kind: PathKind) => {
      const path = readStringField(draft, pathField);
      const seq = (validationSequenceRef.current[pathField] ?? 0) + 1;
      validationSequenceRef.current[pathField] = seq;
      setPathValidations((prev) => ({
        ...prev,
        [pathField]: { state: "checking" },
      }));
      try {
        const result = await settingsService.validatePath(path, kind);
        if (validationSequenceRef.current[pathField] !== seq) return;
        setPathValidations((prev) => ({
          ...prev,
          [pathField]: { state: "result", result },
        }));
      } catch (error) {
        if (validationSequenceRef.current[pathField] !== seq) return;
        logger.error("Path validation failed", error);
        setPathValidations((prev) => ({
          ...prev,
          [pathField]: {
            state: "result",
            result: {
              exists: false,
              kind_ok: false,
              version: null,
              message: "Validation failed",
            },
          },
        }));
      }
    },
    [draft, settingsService]
  );

  const save = useCallback(async (): Promise<{ ok: boolean }> => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await settingsService.saveConfig(draft);
      setBaseline(draft);
      return { ok: true };
    } catch (error) {
      logger.error("Failed to save settings", error);
      setSaveError(
        error instanceof Error ? error.message : "Failed to save settings"
      );
      return { ok: false };
    } finally {
      setIsSaving(false);
    }
  }, [draft, settingsService]);

  const cancel = useCallback(() => {
    setDraft(baseline);
    setSaveError(null);
  }, [baseline]);

  const validation = useMemo(() => validateSettingsDraft(draft), [draft]);
  const isDirty = useMemo(
    () => isSettingsDraftDirty(baseline, draft),
    [baseline, draft]
  );

  return {
    draft,
    baseline,
    isLoading,
    isSaving,
    loadError,
    saveError,
    isDirty,
    isValid: validation.isValid,
    fieldErrors: validation.fieldErrors,
    pathValidations,
    setField,
    setCompressionField,
    revalidatePath,
    save,
    cancel,
    reload,
  };
}

function readStringField(config: AppConfig, key: string): string {
  const value = (config as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { logger } from "../../shared/utils/logger";

export interface FilePickerOptions {
  title: string;
  filters?: { name: string; extensions: string[] }[];
}

/**
 * Thin hook over the Tauri dialog plugin. Returns a callback that opens the
 * OS file picker and resolves to the chosen path (or null if the user cancels).
 *
 * Kept hook-shaped (rather than a free function) so consumers can test by
 * swapping the hook in tests via dependency injection if needed.
 */
export function useFilePicker() {
  const pickFile = useCallback(
    async (options: FilePickerOptions): Promise<string | null> => {
      try {
        const selection = await open({
          multiple: false,
          directory: false,
          title: options.title,
          filters: options.filters,
        });
        if (typeof selection === "string") return selection;
        return null;
      } catch (error) {
        logger.error("File picker failed", error);
        return null;
      }
    },
    []
  );

  return { pickFile };
}

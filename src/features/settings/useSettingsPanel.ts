import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * Tauri event fired by the native menu bar's Settings item.
 * Backed by `MENU_OPEN_SETTINGS_EVENT` in `src-tauri/src/app_menu.rs`.
 */
const MENU_OPEN_SETTINGS_EVENT = "menu-open-settings" as const;

/**
 * Hook that owns the Settings panel's open/closed state.
 *
 * Opening happens either from the native menu bar (which also owns the
 * Ctrl/Cmd+, keyboard accelerator — see `app_menu.rs`) or from any in-app
 * caller via `open()`.
 */
export function useSettingsPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    let cancelled = false;
    const unlistenPromise = listen(MENU_OPEN_SETTINGS_EVENT, () => {
      if (!cancelled) setIsOpen(true);
    });
    return () => {
      cancelled = true;
      void unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, []);

  return { isOpen, open, close };
}

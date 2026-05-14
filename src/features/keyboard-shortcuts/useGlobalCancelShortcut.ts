import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { RecordingStatus, useApi } from "../../api";
import { logger } from "../../shared/utils/logger";

/** Tauri event name fired by `src-tauri/src/shortcuts/registrar.rs`. */
const CANCEL_SHORTCUT_EVENT = "cancel-shortcut";

interface UseGlobalCancelShortcutOptions {
  accelerator: string;
  recordingStatus: RecordingStatus;
  /**
   * Stand down when the Settings panel is open so the panel's own Escape
   * handler can close the dialog without canceling the (rare but possible)
   * concurrent recording.
   */
  enabled: boolean;
  onCancel: () => void | Promise<void>;
}

/**
 * Globally binds the cancel shortcut **only while a recording is active**.
 *
 * ## Why scoped registration
 *
 * A perpetually-bound Escape would swallow Escape from every text input on
 * the OS. The PRD's architecture note ("recording is currently active and we
 * listen for it via a local OS-level keyboard hook only while recording") is
 * the design constraint we honor here: when the user is *not* recording, no
 * cancel binding is live, so Escape behaves normally everywhere.
 *
 * ## Lifecycle
 *
 * - `recordingStatus` transitions to `recording`/`paused` → register.
 * - Anything else, or `enabled` goes false → unregister.
 * - The event listener is mounted once and reads the latest `onCancel` from
 *   a ref so it never goes stale.
 */
export function useGlobalCancelShortcut(
  options: UseGlobalCancelShortcutOptions
): void {
  const { keyboardShortcutsService } = useApi();
  const onCancelRef = useRef(options.onCancel);
  onCancelRef.current = options.onCancel;

  const accelerator = options.accelerator.trim();
  const shouldBeActive =
    options.enabled &&
    accelerator.length > 0 &&
    (options.recordingStatus === "recording" ||
      options.recordingStatus === "paused");

  // Register / unregister based on whether the shortcut should be active.
  useEffect(() => {
    if (!shouldBeActive) {
      void keyboardShortcutsService.clearCancelShortcut().catch(() => undefined);
      return;
    }
    void keyboardShortcutsService.applyCancelShortcut(accelerator).catch((err) => {
      logger.warn("Failed to register cancel shortcut", err);
    });
    return () => {
      void keyboardShortcutsService
        .clearCancelShortcut()
        .catch(() => undefined);
    };
  }, [shouldBeActive, accelerator, keyboardShortcutsService]);

  // Subscribe once to the Rust-side event channel.
  useEffect(() => {
    let cancelled = false;
    const unlistenPromise = listen(CANCEL_SHORTCUT_EVENT, () => {
      if (cancelled) return;
      void onCancelRef.current();
    });
    return () => {
      cancelled = true;
      void unlistenPromise.then((u) => u()).catch(() => undefined);
    };
  }, []);
}

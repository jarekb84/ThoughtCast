import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { RecordingStatus, useApi } from "../../api";
import { logger } from "../../shared/utils/logger";
import { PUSH_TO_TALK_MIN_HOLD_MS, TriggerMode } from "../settings/appConfig";
import {
  evaluateShortcutEvent,
  ShortcutEventState,
} from "./evaluateShortcutEvent";

/** Tauri event name fired by `src-tauri/src/shortcuts/registrar.rs`. */
const RECORD_SHORTCUT_EVENT = "record-shortcut";

interface RecordShortcutPayload {
  state: ShortcutEventState;
}

interface UseGlobalRecordingShortcutOptions {
  accelerator: string;
  triggerMode: TriggerMode;
  /** Live recording status — must be a ref-like reference, not the value, so
   * we read the latest at event time rather than the value captured at hook setup. */
  recordingStatusRef: React.MutableRefObject<RecordingStatus>;
  /** Whether shortcuts should be honored. Disabled while Settings is open and
   * the user is rebinding (so a stray F1 doesn't start a recording). */
  enabled: boolean;
  onStart: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
}

/**
 * Subscribes to the Rust-side `record-shortcut` event bus and dispatches into
 * the recording workflow handlers.
 *
 * ## Lifecycle
 *
 * - On mount (and whenever the accelerator changes), the hook asks Rust to
 *   register the new accelerator. Rust replaces any previous binding atomically.
 * - On unmount, the hook clears the registration so dev hot-reloads don't
 *   leave a dangling handler emitting events into a stale listener.
 *
 * ## Why a status *ref* instead of a value
 *
 * The event listener is set up once and outlives many renders. If we captured
 * the recordingStatus *value* in the closure, the listener would see a stale
 * status forever. A ref gives us a live read at event-fire time.
 *
 * ## Why we read trigger mode + enabled from refs too
 *
 * Same reason — these can change at runtime (Settings) without re-registering
 * the event listener.
 */
export function useGlobalRecordingShortcut(
  options: UseGlobalRecordingShortcutOptions
): void {
  const { keyboardShortcutsService } = useApi();

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const heldRef = useRef(false);
  const pttStartedRef = useRef(false);
  const pttTimerRef = useRef<number | null>(null);

  // Re-register whenever the accelerator changes.
  useEffect(() => {
    const accelerator = options.accelerator.trim();
    if (!accelerator) {
      void keyboardShortcutsService.clearShortcut().catch((err) => {
        logger.warn("Failed to clear shortcut", err);
      });
      return;
    }
    void keyboardShortcutsService.applyShortcut(accelerator).catch((err) => {
      logger.error("Failed to apply shortcut", err);
    });
  }, [options.accelerator, keyboardShortcutsService]);

  // Subscribe once.
  useEffect(() => {
    let cancelled = false;
    const unlistenPromise = listen<RecordShortcutPayload>(
      RECORD_SHORTCUT_EVENT,
      (event) => {
        if (cancelled) return;
        handleEvent(event.payload.state);
      }
    );

    function handleEvent(state: ShortcutEventState) {
      const opts = optionsRef.current;
      if (!opts.enabled) return;

      const action = evaluateShortcutEvent(state, {
        triggerMode: opts.triggerMode,
        recordingStatus: opts.recordingStatusRef.current,
        isHeld: heldRef.current,
        pttStarted: pttStartedRef.current,
      });

      // Press / release bookkeeping happens *after* evaluation so the
      // evaluator can rely on pre-event flags.
      if (state === "pressed") heldRef.current = true;
      if (state === "released") {
        heldRef.current = false;
        pttStartedRef.current = false;
        if (pttTimerRef.current !== null) {
          window.clearTimeout(pttTimerRef.current);
          pttTimerRef.current = null;
        }
      }

      switch (action.kind) {
        case "ignore":
          return;
        case "start":
          void opts.onStart();
          return;
        case "stop":
        case "stop-after-ptt":
          void opts.onStop();
          return;
        case "schedule-start":
          pttTimerRef.current = window.setTimeout(() => {
            pttStartedRef.current = true;
            void optionsRef.current.onStart();
          }, PUSH_TO_TALK_MIN_HOLD_MS);
          return;
      }
    }

    return () => {
      cancelled = true;
      if (pttTimerRef.current !== null) {
        window.clearTimeout(pttTimerRef.current);
      }
      void unlistenPromise.then((u) => u()).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On unmount of the whole app, clear the Rust-side registration. Browsers
  // also clear on full reload; this catches dev hot-reload.
  useEffect(() => {
    return () => {
      void keyboardShortcutsService.clearShortcut().catch(() => undefined);
    };
  }, [keyboardShortcutsService]);
}

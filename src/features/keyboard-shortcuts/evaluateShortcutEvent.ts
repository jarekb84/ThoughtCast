import { RecordingStatus } from "../../api";
import { TriggerMode } from "../settings/appConfig";

/**
 * Pure decision logic for what a global-shortcut event means *right now*.
 *
 * Pulled out of the hook so that the trigger-mode rules — which need to cover
 * idle vs. recording vs. processing, key-repeat handling, and sub-300ms PTT
 * taps — can be unit-tested without timers, services, or React.
 */

export type ShortcutEventState = "pressed" | "released";

/** What the hook should do in response to a single shortcut event. */
export type ShortcutAction =
  | { kind: "ignore" }
  | { kind: "start" }
  | { kind: "stop" }
  /** PTT only: schedule `start` after the sub-300ms tap window. */
  | { kind: "schedule-start" }
  /** PTT only: stop a started PTT recording. */
  | { kind: "stop-after-ptt" };

export interface EvaluationContext {
  triggerMode: TriggerMode;
  recordingStatus: RecordingStatus;
  /** True iff a previous "pressed" event arrived without a matching "released". */
  isHeld: boolean;
  /** PTT only: true once the 300ms tap window has elapsed and start fired. */
  pttStarted: boolean;
}

/**
 * Decide what action a single shortcut event should produce.
 *
 * `pressed` semantics in **toggle** mode:
 *   - idle | processing  → start (processing case = PRD edge 2; start a new
 *     recording while the previous transcribes)
 *   - recording | paused → stop
 *
 * `pressed` semantics in **push-to-talk** mode:
 *   - idle | processing → schedule-start (the hook waits 300ms; if released
 *     sooner, the start never fires — PRD edge 4)
 *   - anything else     → ignore (a press while already recording is a
 *     repeat-key artifact or a stray; PRD edge 3 says only key-up ends PTT)
 *
 * Repeat-key handling: any `pressed` with `isHeld === true` is ignored.
 *
 * `released` semantics in toggle mode → ignore (only `pressed` toggles).
 *
 * `released` semantics in PTT mode:
 *   - pttStarted     → stop-after-ptt
 *   - !pttStarted    → ignore (the tap was below the 300ms threshold)
 */
export function evaluateShortcutEvent(
  state: ShortcutEventState,
  ctx: EvaluationContext
): ShortcutAction {
  if (state === "pressed") {
    if (ctx.isHeld) return { kind: "ignore" };

    if (ctx.triggerMode === "toggle") {
      return decideToggleOnPress(ctx.recordingStatus);
    }
    return decidePttOnPress(ctx.recordingStatus);
  }

  if (ctx.triggerMode === "toggle") return { kind: "ignore" };
  return ctx.pttStarted ? { kind: "stop-after-ptt" } : { kind: "ignore" };
}

function decideToggleOnPress(status: RecordingStatus): ShortcutAction {
  switch (status) {
    case "idle":
    case "processing":
      return { kind: "start" };
    case "recording":
    case "paused":
      return { kind: "stop" };
  }
}

function decidePttOnPress(status: RecordingStatus): ShortcutAction {
  switch (status) {
    case "idle":
    case "processing":
      return { kind: "schedule-start" };
    case "recording":
    case "paused":
      return { kind: "ignore" };
  }
}

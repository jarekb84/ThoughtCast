import SettingsSection from "./SettingsSection";
import type { useSettingsForm } from "../useSettingsForm";
import type { RecordingStatus } from "../../../api";
import { TriggerMode } from "../appConfig";
import ShortcutCaptureField from "./ShortcutCaptureField";
import "./KeyboardShortcutsSection.css";

type FormHandle = ReturnType<typeof useSettingsForm>;

interface KeyboardShortcutsSectionProps {
  form: FormHandle;
  recordingStatus: RecordingStatus;
}

/**
 * Settings → Keyboard Shortcuts tab.
 *
 * Lets the user rebind both the global record shortcut and the
 * cancel-recording shortcut, and switch between toggle and push-to-talk
 * trigger modes. Disabled while a recording is in progress (PRD edge case 8)
 * so a stray key during a take cannot accidentally rebind.
 */
export default function KeyboardShortcutsSection({
  form,
  recordingStatus,
}: KeyboardShortcutsSectionProps) {
  const shortcuts = form.draft.keyboardShortcuts;
  const isRecording = recordingStatus === "recording" || recordingStatus === "paused";

  const setShortcutField = <K extends keyof typeof shortcuts>(
    key: K,
    value: (typeof shortcuts)[K]
  ) => {
    form.setField("keyboardShortcuts", { ...shortcuts, [key]: value });
  };

  return (
    <SettingsSection
      title="Keyboard Shortcuts"
      description="System-wide shortcuts so you can capture a thought without bringing this window to the front."
    >
      {isRecording && (
        <p className="shortcut-disabled-notice">
          ⏺ Recording in progress — finish or cancel the current take before
          rebinding shortcuts.
        </p>
      )}

      <ShortcutCaptureField
        label="Record / stop shortcut"
        value={shortcuts.recordShortcut}
        disabled={isRecording}
        helpText="If the shortcut doesn't fire, another application may already own
                  the combination at the OS level. Pick a different one or close
                  the conflicting app."
        onChange={(captured) => setShortcutField("recordShortcut", captured)}
      />

      <ShortcutCaptureField
        label="Cancel recording shortcut"
        value={shortcuts.cancelShortcut}
        disabled={isRecording}
        helpText="Only active while a recording is in progress, so the default
                  Escape doesn't interfere with text inputs in other apps when
                  ThoughtCast is idle."
        onChange={(captured) => setShortcutField("cancelShortcut", captured)}
      />

      <fieldset className="shortcut-fieldset" disabled={isRecording}>
        <legend className="shortcut-legend">Trigger mode</legend>
        <label className="shortcut-radio">
          <input
            type="radio"
            name="triggerMode"
            value="toggle"
            checked={shortcuts.triggerMode === "toggle"}
            onChange={() => setShortcutField("triggerMode", "toggle" as TriggerMode)}
          />
          <span>
            <strong>Toggle</strong> — press once to start, press again to stop
          </span>
        </label>
        <label className="shortcut-radio">
          <input
            type="radio"
            name="triggerMode"
            value="push-to-talk"
            checked={shortcuts.triggerMode === "push-to-talk"}
            onChange={() =>
              setShortcutField("triggerMode", "push-to-talk" as TriggerMode)
            }
          />
          <span>
            <strong>Push-to-talk</strong> — hold to record, release to stop
          </span>
        </label>
      </fieldset>
    </SettingsSection>
  );
}

import { useEffect } from "react";
import { Button } from "../../shared/components";
import { useFilePicker, FilePickerOptions } from "./useFilePicker";
import { PathKind } from "./appConfig";
import type { ValidationStatus } from "./useSettingsForm";
import "./PathPickerField.css";

interface PathPickerFieldProps {
  label: string;
  value: string;
  pickerOptions: FilePickerOptions;
  kind: PathKind;
  validation: ValidationStatus | undefined;
  errorOverride?: string;
  onChange: (next: string) => void;
  onValidate: () => void;
  helpText?: string;
}

/**
 * Label + path input + Browse button + validation status icon.
 *
 * Auto-fires validation on mount (when there's already a value) and after the
 * user changes the path via picker. Free-text edits don't auto-validate to
 * avoid hammering the filesystem on every keystroke — the user can blur the
 * field (handled here on `onBlur`) to recheck.
 */
export default function PathPickerField({
  label,
  value,
  pickerOptions,
  kind: _kind,
  validation,
  errorOverride,
  onChange,
  onValidate,
  helpText,
}: PathPickerFieldProps) {
  const { pickFile } = useFilePicker();

  useEffect(() => {
    if (value.trim() !== "") {
      onValidate();
    }
    // Intentionally only on first mount per field — subsequent changes flow
    // through onBlur / onBrowse, not value churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBrowse = async () => {
    const picked = await pickFile(pickerOptions);
    if (picked !== null) {
      onChange(picked);
      // Defer validation to the next event loop so the new value is in flight
      // when the parent re-renders.
      queueMicrotask(onValidate);
    }
  };

  const statusIcon = renderStatusIcon(validation, errorOverride);

  return (
    <div className="settings-path-field">
      <label className="settings-path-label">{label}</label>
      <div className="settings-path-row">
        <input
          type="text"
          className="settings-path-input"
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onValidate}
          placeholder="Click Browse… or paste a path"
        />
        <Button variant="secondary" onClick={handleBrowse}>
          Browse…
        </Button>
      </div>
      <div className="settings-path-status">{statusIcon}</div>
      {helpText && <div className="settings-path-help">{helpText}</div>}
    </div>
  );
}

function renderStatusIcon(
  validation: ValidationStatus | undefined,
  errorOverride: string | undefined
) {
  if (errorOverride) {
    return <span className="status-message status-error">⚠ {errorOverride}</span>;
  }
  if (!validation || validation.state === "idle") {
    return <span className="status-message status-idle">Not validated</span>;
  }
  if (validation.state === "checking") {
    return <span className="status-message status-checking">Checking…</span>;
  }
  const r = validation.result;
  if (r.exists && r.kind_ok) {
    return <span className="status-message status-success">✓ {r.message}</span>;
  }
  return <span className="status-message status-error">⚠ {r.message}</span>;
}

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "../../../shared/components";
import { captureAcceleratorFromEvent } from "../../keyboard-shortcuts/captureAccelerator";

interface ShortcutCaptureFieldProps {
  label: string;
  /** The currently-saved accelerator (e.g. "F1"). */
  value: string;
  /** Disable rebind UI (e.g. while a recording is in progress). */
  disabled?: boolean;
  helpText?: string;
  onChange: (capturedAccelerator: string) => void;
}

/**
 * Label + read-only input + Rebind button row that captures the next physical
 * key combination the user presses while in capture mode.
 *
 * Extracted from KeyboardShortcutsSection so we can reuse it for both the
 * record shortcut and the cancel shortcut. The capture state is local — the
 * parent only sees the resulting accelerator string via `onChange`.
 */
export default function ShortcutCaptureField({
  label,
  value,
  disabled = false,
  helpText,
  onChange,
}: ShortcutCaptureFieldProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startCapture = useCallback(() => {
    if (disabled) return;
    setIsCapturing(true);
    inputRef.current?.focus();
  }, [disabled]);

  const stopCapture = useCallback(() => setIsCapturing(false), []);

  useEffect(() => {
    if (!isCapturing) return;
    const handler = (event: KeyboardEvent) => {
      const captured = captureAcceleratorFromEvent(event);
      if (!captured) return;
      event.preventDefault();
      event.stopPropagation();
      onChange(captured);
      stopCapture();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isCapturing, onChange, stopCapture]);

  return (
    <div className="shortcut-field">
      <label className="shortcut-label">{label}</label>
      <div className="shortcut-row">
        <input
          ref={inputRef}
          type="text"
          className="shortcut-input"
          value={isCapturing ? "Press a key combination…" : value}
          readOnly
          spellCheck={false}
          onBlur={stopCapture}
          disabled={disabled}
        />
        <Button
          variant="secondary"
          onClick={isCapturing ? stopCapture : startCapture}
          disabled={disabled}
        >
          {isCapturing ? "Cancel" : "Rebind"}
        </Button>
      </div>
      {helpText && <p className="shortcut-hint">{helpText}</p>}
    </div>
  );
}

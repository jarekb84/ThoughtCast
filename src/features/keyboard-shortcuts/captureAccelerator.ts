/**
 * Convert a single KeyboardEvent into a Tauri-global-shortcut accelerator string
 * (e.g. `"F1"`, `"CommandOrControl+Shift+R"`).
 *
 * Returns `null` for events that are pure modifiers (Shift alone, etc.) — the
 * UI keeps capturing until a non-modifier key arrives. This way pressing
 * Ctrl+Shift+R captures the full combination rather than treating the modifier
 * keys as the binding.
 *
 * Pulled into its own module so the mapping rules can be unit-tested without
 * spinning up the Settings UI.
 */
export function captureAcceleratorFromEvent(
  event: KeyboardEvent
): string | null {
  if (isPureModifier(event.key)) return null;

  const parts: string[] = [];
  // "CommandOrControl" maps to Cmd on macOS and Ctrl elsewhere — the canonical
  // cross-platform modifier name in Tauri's accelerator grammar.
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const keyName = normalizeKeyName(event.key, event.code);
  if (!keyName) return null;
  parts.push(keyName);

  return parts.join("+");
}

function isPureModifier(key: string): boolean {
  return (
    key === "Control" ||
    key === "Meta" ||
    key === "Alt" ||
    key === "Shift" ||
    key === "OS"
  );
}

function normalizeKeyName(key: string, code: string): string | null {
  // F-keys: KeyboardEvent.key is already "F1" .. "F24", which Tauri accepts.
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;

  // Single printable character — uppercase to match accelerator convention.
  if (key.length === 1) {
    const upper = key.toUpperCase();
    // Strict ASCII range only — exotic IME-produced keys are skipped.
    if (/^[A-Z0-9]$/.test(upper)) return upper;
  }

  // Named keys we want to allow. KeyboardEvent.key gives "Escape", "Enter",
  // "Tab", "ArrowUp", etc.; Tauri's accelerator parser accepts the same forms.
  const named: Record<string, string> = {
    Escape: "Escape",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    " ": "Space",
  };
  if (key in named) return named[key];

  // Fall back to `code` for keys whose `key` value is locale-dependent (e.g.
  // certain numpad / OEM keys). `Numpad0`..`Numpad9` map directly.
  if (/^Numpad[0-9]$/.test(code)) return code;

  return null;
}

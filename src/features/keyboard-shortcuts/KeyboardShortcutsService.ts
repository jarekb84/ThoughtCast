import { wrapTauriInvoke } from "../../api/services/tauriInvokeWrapper";

/**
 * Register / unregister the OS-global record shortcut.
 *
 * Registration is owned by the Rust side (via tauri-plugin-global-shortcut) so
 * the binding is live the moment the app process starts — before React mounts.
 * This service is the React-facing handle for re-registration after the user
 * rebinds the shortcut in Settings.
 */
export interface IKeyboardShortcutsService {
  /** Re-register the record shortcut using the given accelerator string. */
  applyShortcut(accelerator: string): Promise<void>;
  /** Remove the currently-bound record shortcut, if any. */
  clearShortcut(): Promise<void>;
  /**
   * Register the cancel shortcut. Callers (typically the cancel hook gated on
   * `recordingStatus`) should register only while a recording is active, then
   * call `clearCancelShortcut()` once the take ends.
   */
  applyCancelShortcut(accelerator: string): Promise<void>;
  clearCancelShortcut(): Promise<void>;
}

export class TauriKeyboardShortcutsService implements IKeyboardShortcutsService {
  async applyShortcut(accelerator: string): Promise<void> {
    return wrapTauriInvoke<void>(
      "apply_keyboard_shortcut",
      { accelerator },
      "Failed to apply keyboard shortcut",
      "SHORTCUT_APPLY_FAILED"
    );
  }

  async clearShortcut(): Promise<void> {
    return wrapTauriInvoke<void>(
      "clear_keyboard_shortcut",
      undefined,
      "Failed to clear keyboard shortcut",
      "SHORTCUT_CLEAR_FAILED"
    );
  }

  async applyCancelShortcut(accelerator: string): Promise<void> {
    return wrapTauriInvoke<void>(
      "apply_cancel_shortcut_command",
      { accelerator },
      "Failed to apply cancel shortcut",
      "CANCEL_SHORTCUT_APPLY_FAILED"
    );
  }

  async clearCancelShortcut(): Promise<void> {
    return wrapTauriInvoke<void>(
      "clear_cancel_shortcut_command",
      undefined,
      "Failed to clear cancel shortcut",
      "CANCEL_SHORTCUT_CLEAR_FAILED"
    );
  }
}

/** In-memory mock that records every call — used by hook tests. */
export class MockKeyboardShortcutsService implements IKeyboardShortcutsService {
  public applied: string[] = [];
  public cleared: number = 0;
  public appliedCancel: string[] = [];
  public clearedCancel: number = 0;

  async applyShortcut(accelerator: string): Promise<void> {
    this.applied.push(accelerator);
  }

  async clearShortcut(): Promise<void> {
    this.cleared += 1;
  }

  async applyCancelShortcut(accelerator: string): Promise<void> {
    this.appliedCancel.push(accelerator);
  }

  async clearCancelShortcut(): Promise<void> {
    this.clearedCancel += 1;
  }
}

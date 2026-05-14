use std::str::FromStr;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Event fired on the JS event bus when the record shortcut is pressed or
/// released. Payload is `{ state: "pressed" | "released" }`.
pub const RECORD_SHORTCUT_EVENT: &str = "record-shortcut";

/// Event fired when the cancel shortcut is pressed. The cancel shortcut is
/// registered globally only while a recording is active, so this event is
/// only emitted in that window. Payload is `{ state: "pressed" }`.
pub const CANCEL_SHORTCUT_EVENT: &str = "cancel-shortcut";

/// Single-slot store for one registered shortcut.
///
/// We use one slot per *logical* shortcut (record, cancel) so rebinding can
/// unregister precisely the previous binding without affecting other slots —
/// `unregister_all` would be too coarse if we ever add a third shortcut.
struct ShortcutSlot {
    current: Mutex<Option<Shortcut>>,
}

impl ShortcutSlot {
    fn new() -> Self {
        Self {
            current: Mutex::new(None),
        }
    }
}

struct RecordShortcutSlot(ShortcutSlot);
struct CancelShortcutSlot(ShortcutSlot);

#[derive(Debug, Clone, serde::Serialize)]
struct ShortcutEventPayload {
    state: &'static str,
}

/// Register (or replace) the record shortcut, emitting `record-shortcut`
/// events with both `pressed` and `released` states so PTT mode can detect
/// key-up.
pub fn register_record_shortcut(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    ensure_record_slot(app);
    let slot = &app.state::<RecordShortcutSlot>().0;
    let shortcut = parse_accelerator(accelerator)?;

    swap_in_slot(app, slot, Some(shortcut))?;

    let handler_app = app.clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _short, event| {
            let state = match event.state() {
                ShortcutState::Pressed => "pressed",
                ShortcutState::Released => "released",
            };
            let _ = handler_app.emit(RECORD_SHORTCUT_EVENT, ShortcutEventPayload { state });
        })
        .map_err(|e| format!("Failed to register record shortcut '{}': {}", accelerator, e))?;
    Ok(())
}

pub fn unregister_record_shortcut(app: &AppHandle) -> Result<(), String> {
    let Some(slot_state) = app.try_state::<RecordShortcutSlot>() else {
        return Ok(());
    };
    swap_in_slot(app, &slot_state.0, None)
}

/// Register the cancel shortcut. Callers (typically a React hook gated on
/// `recordingStatus`) are expected to register only while a recording is
/// active, then unregister once the take ends — keeping the OS-global Escape
/// binding from clobbering text inputs in other apps when ThoughtCast is idle.
pub fn register_cancel_shortcut(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    ensure_cancel_slot(app);
    let slot = &app.state::<CancelShortcutSlot>().0;
    let shortcut = parse_accelerator(accelerator)?;

    swap_in_slot(app, slot, Some(shortcut))?;

    let handler_app = app.clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _short, event| {
            // We only emit on press — cancel has no "release" semantic.
            if event.state() == ShortcutState::Pressed {
                let _ = handler_app.emit(
                    CANCEL_SHORTCUT_EVENT,
                    ShortcutEventPayload { state: "pressed" },
                );
            }
        })
        .map_err(|e| format!("Failed to register cancel shortcut '{}': {}", accelerator, e))?;
    Ok(())
}

pub fn unregister_cancel_shortcut(app: &AppHandle) -> Result<(), String> {
    let Some(slot_state) = app.try_state::<CancelShortcutSlot>() else {
        return Ok(());
    };
    swap_in_slot(app, &slot_state.0, None)
}

fn parse_accelerator(accelerator: &str) -> Result<Shortcut, String> {
    Shortcut::from_str(accelerator).map_err(|e| {
        format!(
            "Invalid shortcut '{}': {} (use e.g. \"F1\" or \"CommandOrControl+Shift+R\")",
            accelerator, e
        )
    })
}

/// Replace the binding in a slot atomically: unregister whatever was there,
/// then store the new value (or `None` to clear).
fn swap_in_slot(
    app: &AppHandle,
    slot: &ShortcutSlot,
    next: Option<Shortcut>,
) -> Result<(), String> {
    let global = app.global_shortcut();
    let mut current = slot
        .current
        .lock()
        .map_err(|_| "Shortcut slot lock poisoned".to_string())?;
    if let Some(prev) = current.take() {
        let _ = global.unregister(prev);
    }
    *current = next;
    Ok(())
}

fn ensure_record_slot(app: &AppHandle) {
    if app.try_state::<RecordShortcutSlot>().is_none() {
        app.manage(RecordShortcutSlot(ShortcutSlot::new()));
    }
}

fn ensure_cancel_slot(app: &AppHandle) {
    if app.try_state::<CancelShortcutSlot>().is_none() {
        app.manage(CancelShortcutSlot(ShortcutSlot::new()));
    }
}

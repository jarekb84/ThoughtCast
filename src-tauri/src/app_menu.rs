//! Native window menu bar.
//!
//! On Windows/Linux the menu sits at the top of the app window; on macOS it
//! appears in the global menu bar. Top-level entries must be submenus (it's
//! not possible to put a "leaf" item directly at the top level on any of
//! Tauri's target platforms), so we group items under a single "App" submenu
//! that future entries (About, Check for updates, …) can drop into.

use tauri::menu::{Menu, MenuEvent, MenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

/// Tauri event name fired when the user picks the Settings menu item.
/// The frontend listens for it and opens the Settings panel.
pub const MENU_OPEN_SETTINGS_EVENT: &str = "menu-open-settings";

const SETTINGS_ITEM_ID: &str = "menu-settings";

/// Build the application menu and attach it to the given app handle.
pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // No keyboard accelerator: muda 0.17 (Tauri 2.9's menu lib) does not
    // reliably bind punctuation-key accelerators (e.g., Ctrl+Comma) for menu
    // items nested under a Submenu on Windows. The hint string would display
    // in the menu but the key combination wouldn't fire — worse than not
    // showing one at all. Mouse + Alt-navigation still reach the item.
    let settings_item = MenuItem::with_id(app, SETTINGS_ITEM_ID, "Settings…", true, None::<&str>)?;

    let app_submenu = Submenu::with_items(app, "ThoughtCast", true, &[&settings_item])?;
    let menu = Menu::with_items(app, &[&app_submenu])?;
    Ok(menu)
}

/// Handle a menu click event by routing the known IDs to Tauri events the
/// frontend listens for. Unknown IDs are ignored.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        SETTINGS_ITEM_ID => {
            let _ = app.emit(MENU_OPEN_SETTINGS_EVENT, ());
        }
        _ => {}
    }
}

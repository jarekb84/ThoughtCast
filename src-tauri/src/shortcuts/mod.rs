//! Global keyboard shortcut wiring.
//!
//! ## Why this module sits at the top level (not under `recording/`)
//!
//! Shortcuts are an input device — they belong to the application's input
//! plumbing, not the recording domain. The recording module exposes
//! handler-style commands (`start_recording`, `stop_recording`,
//! `cancel_recording`); the shortcuts module decides *when* to fire them and
//! emits events that the frontend translates into those handler calls.
//!
//! ## Why we register the record shortcut from Rust, not from JS
//!
//! The record shortcut must work the moment the app starts, before any React
//! code has had a chance to subscribe. Registering on the Rust side (in
//! `tauri::Builder::setup`) means the binding is live as soon as the OS
//! delivers the first key event.
//!
//! ## Why the cancel shortcut lifecycle is React-driven
//!
//! Unlike record, the cancel shortcut should only be globally bound *while a
//! recording is active*. A perpetually-bound Escape would conflict with every
//! text input on the OS. React owns `recordingStatus` so it owns the
//! cancel-shortcut register/unregister calls, via the Tauri commands wired
//! in `lib.rs`.

mod registrar;

pub use registrar::{
    register_cancel_shortcut, register_record_shortcut, unregister_cancel_shortcut,
    unregister_record_shortcut,
};

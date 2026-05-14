//! Cross-platform helpers for spawning native subprocesses.
//!
//! On Windows the default `Command` spawn flashes a console window for every
//! subprocess we shell out to (FFmpeg, Whisper.cpp). The same `CREATE_NO_WINDOW`
//! incantation was being repeated at every spawn site — this helper centralizes
//! it so a new spawn site can't forget to apply it.

use std::process::Command;

/// Apply the `CREATE_NO_WINDOW` creation flag on Windows so the child process
/// doesn't pop up a console window during a recording. No-op on other
/// platforms.
///
/// Returns the command for fluent-style chaining at the call site.
pub fn apply_no_console_window(cmd: &mut Command) -> &mut Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // Documented Win32 process-creation flag — keeps the child detached
        // from any console so a console window is never created or attached.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Suppress unused-variable warning on non-Windows without a `_` rename.
        let _ = cmd;
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apply_no_console_window_is_chainable_and_safe() {
        // The helper must be safe to call on every platform and return the
        // same command so call sites can keep using the builder style.
        let mut cmd = Command::new("echo");
        let ptr_before = &cmd as *const Command;
        let result = apply_no_console_window(&mut cmd);
        let ptr_after = result as *const Command;
        assert_eq!(ptr_before, ptr_after, "must return the same command ref");
    }
}

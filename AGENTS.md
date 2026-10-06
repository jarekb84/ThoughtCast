# AGENTS.md

Guidance for AI coding agents (and humans) working on ThoughtCast. Read this first.

## What ThoughtCast is

A local-first desktop app (Tauri + React + Rust) that records the user's voice, transcribes it on the machine, copies the transcript to the clipboard and keeps every session. The user records long voice notes (20 to 80 minutes) every day and hands the transcripts to AI tools, so **transcription accuracy is the product**. Nothing leaves the machine: no cloud APIs, no telemetry.

Core flow: record → stop → save WAV → transcribe (chunked when long) → clean → copy to clipboard → store the session → compress the audio to M4A.

## Layout

| Path | Owns |
| --- | --- |
| `src-tauri/src/lib.rs` | The Tauri command surface. Each command is a thin call into `recording/`, `audio_cues/` or `shortcuts/`. |
| `src-tauri/src/recording/audio` | Microphone capture (cpal), live levels, WAV writing (hound). |
| `src-tauri/src/recording/session` | Session lifecycle (stop, transcribe, retranscribe) and the `sessions.json` index. |
| `src-tauri/src/recording/transcription` | Speech-to-text engines (external CLIs), the chunked orchestrator, transcript cleanup. |
| `src-tauri/src/recording/chunking` | Silence detection and WAV splitting for long recordings (FFmpeg). |
| `src-tauri/src/recording/compression` | WAV → M4A after transcription, plus the batch compressor for old sessions. |
| `src-tauri/src/recording/config` | `config.json`: loading with defaults, saving, path validation. |
| `src-tauri/src/recording/statistics` | Transcription-time estimates from past sessions. |
| `src-tauri/src/audio_cues` | Start/stop/ready sounds (rodio). |
| `src/api` | Typed services over Tauri commands. Every `invoke` goes through `wrapTauriInvoke`. |
| `src/app` | App shell and the recording workflow hook. |
| `src/features/<feature>` | One folder per feature: components, hooks, pure logic and tests side by side. |
| `src/shared` | Generic UI primitives, formatters, logger, design tokens. |
| `docs/` | Setup guides, PRDs, research. `docs/voiceNotes/` is git-ignored scratch space for the user's raw notes and audio. |

User data lives in `~/Documents/ThoughtCast/` (`config.json`, `sessions.json`, `audio/`, `text/`, `sounds/`, `logs/`). It's the user's real data: read the config and session metadata when debugging, but treat transcripts and audio as private.

## Rules

- **Local only.** Transcription engines run as external processes (whisper.cpp's `whisper-cli`, `parakeet-cli`) or local libraries. Never add a network call to the transcription path.
- **Recordings are never lost.** The WAV is written before transcription starts; transcription and compression failures leave the session and its audio intact.
- **Tauri calls go through `wrapTauriInvoke`** (`src/api/services/tauriInvokeWrapper.ts`), which turns failures into `ApiError` with a message and a code. Service tests mock `@tauri-apps/api/core` and keep the wrapper real; hook and feature tests inject mock services through `ApiProvider`.
- **Components render; logic lives elsewhere.** `.tsx` files hold markup and wiring. Calculations, state machines and formatting go in hooks (`use*.ts`) or pure functions (`*.ts`) with tests next to them.
- **Config is backward compatible.** Every new `config.json` field has a serde default, so an old config file keeps loading. The TypeScript mirror is `src/features/settings/appConfig.ts`.
- **Logging:** use `logger` (`src/shared/utils/logger.ts`) in the frontend, never `console.*`. Debug output needs `VITE_DEBUG_LOGS=true` in `.env.local`. Use the `log` crate in Rust.

## Working from long voice-note sessions

The user gives requests as long, transcribed voice notes: one session can cover one feature or ten, with asides, corrections and repeated words (and the transcription errors this app is trying to fix). That's expected. How to work through one:

1. **Read it all first, then list every request** (including the small asides) and every question asked. Drop the transcription noise; keep the intent. Supporting files (audio, other transcripts) usually sit in `docs/voiceNotes/`.
2. **Group and sequence.** Turn the list into commits that each do one thing. Put **groundwork first**: if the requests land on code that's tangled, oversized or untested, refactor it (with no behavior change) in its own commit before building on it. Splitting a file, extracting a module, adding tests around something about to change, or adding tooling are all fair game, and you don't need to ask.
3. **Prefer the general solution** when a request is an instance of a pattern (a second transcription engine is an engine behind the same seam, not a copy of the Whisper path).
4. **Measure when you can.** For accuracy work, run the real binaries on real audio and compare, rather than reasoning about flags. Keep benchmark scripts and downloads in the scratchpad, and record conclusions in `docs/`.
5. **Answer the questions** in the final reply, even the ones the code doesn't change.
6. **Keep velocity.** Every commit leaves `npm run integration-precheck` passing, so the next session starts from green. If something is deferred, say so.
7. **Summarize, then offer a release.** When every request is done and checks pass, give the summary (what changed, by request; answers; what was deferred), then ask one question with the question tool: "Cut release?", with the choices "Cut the release" and "Make changes first". Don't release without a yes. See "Releases" for the steps.

### Reading the repo within a session

Long sessions re-read the whole context every turn, so keep it lean without reading less of what matters:

- **Find the owner before opening files.** Grep for the function, command or type name (`grep -rn "fn stop_recording" src-tauri/src`, `grep -rn "useRecordingWorkflow" src`) and read the file or the lines around the match, rather than reading a folder's worth.
- **Batch.** Independent reads, searches and checks go in one turn (parallel calls, or one shell command).
- **Read check results by exit code.** `npm run integration-precheck | tail && next` runs `next` even when the check failed.
- **Screenshots and images** stay in context. Take them once something is done, not for every intermediate state.

## Keeping it easy to change

- Files stay under about 400 lines (hard limit 600), not counting tests. `npm run check:size` enforces it. When a file grows, split it by responsibility (a Rust module becomes a folder of files).
- One responsibility per file. New files start with a short comment saying what they own (`//!` in Rust, `//` or a JSDoc block in TypeScript).
- A new feature is a new file wired in at a seam (a command in `lib.rs`, a service in `src/api`, a section in Settings), rather than more lines in an existing file.
- When a refactor replaces something, delete what it replaced in the same change. `npm run knip` finds unused TypeScript files and exports.
- Feature folders, not type folders: no `components/`, `hooks/` or `utils/` inside a feature. `src/shared/components/` is the one exception, for generic UI primitives.

## Commands

| Task | Command |
| --- | --- |
| Everything before a commit (also the pre-commit hook) | `npm run integration-precheck` |
| TypeScript check / UI tests | `npm run type-check`, `npm test` |
| Rust check / tests | `npm run rust:check`, `npm run rust:test` |
| File size limits | `npm run check:size` |
| Desktop app in dev mode | `npm run tauri:dev` |
| Local production build | `npm run tauri:build` |

## Releases

Versions come from git tags (`vX.Y.Z`); `scripts/inject-git-version.js` stamps them into builds, so don't edit version numbers in `package.json` or `tauri.conf.json`.

1. Work happens on a branch and lands on `main` through a pull request.
2. PRs are squash-merged, so the PR title becomes the commit on `main`. Every push to `main` runs `.github/workflows/auto-tag.yml`, which reads that newest commit: a `MINOR:` prefix tags the next minor version, `MAJOR:` the next major, anything else the next patch.
3. The installers are built by the **Build and Release** workflow (`.github/workflows/release-cross-platform.yml`, manual dispatch only), which releases the latest tag on `main` with the Windows `.exe` and the Apple Silicon `.dmg`. Dispatch it from GitHub → Actions, or `gh workflow run "Build and Release"` when `gh` is authenticated.

So "cut the release" means: push the branch, open the PR (title prefixed with `MINOR:` for a feature round), and after it's squash-merged and tagged, dispatch Build and Release. Pushing and merging are outward-facing: do them only after the user says yes.

## Commit messages

A prefix, then what changed; the body says why. The `commit-msg` hook (`scripts/check-commit-msg.mjs`) rejects anything else:

```
IMPROVE: New capability or enhancement (#PR)
BUG: Fix for unintended behavior
REFACTOR: Restructuring with no behavior change
DOCS: Documentation only
CHORE: Tooling, config, housekeeping
MINOR: A round of features; on the PR title, bumps the minor version
MAJOR: Breaking change; on the PR title, bumps the major version
```

Only the PR title (the squash commit on `main`) decides the release bump (see "Releases"); branch commits use the descriptive prefixes.

## Platform notes

- Whisper.cpp, its models, and FFmpeg are installed by the user and configured by path (Settings, or `config.json`). See `docs/SETUP_WHISPER.md`.
- Recordings are captured at the device's native rate and written as WAV; FFmpeg resamples to 16 kHz mono for chunking and decoding.
- On Windows every spawned process uses `apply_no_console_window` so no console flashes during a recording.
- macOS builds can't be cross-compiled from Windows; the release workflow builds them.

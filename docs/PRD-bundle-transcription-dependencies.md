# PRD: Bundle Transcription Dependencies (Whisper.cpp + FFmpeg)

## Problem Statement

ThoughtCast currently delegates three things to the user before the app can do anything useful:

1. Compile or install **Whisper.cpp** locally and provide an absolute path to `whisper-cli` / `whisper-cli.exe`.
2. Install **FFmpeg** locally and provide an absolute path to the `ffmpeg` binary (used by audio compression and silence-detect chunking).
3. Download a **Whisper model** (`.bin`) and provide its absolute path.

All three live in [config.json](../src-tauri/src/recording/models.rs) (`whisperPath`, `ffmpegPath`, `modelPath`) and are managed manually through the Settings → Transcription / Compression tabs ([TranscriptionSettingsSection.tsx](../src/features/settings/sections/TranscriptionSettingsSection.tsx)). The first-run experience for a new user — or for the same user moving to a new machine — is essentially "go read [SETUP_WHISPER.md](SETUP_WHISPER.md), compile a C++ project, then come back."

This is fine for me on one workstation. It is unworkable as a portable release artifact, and it pushes friction onto exactly the part of the app a user can't bypass: there is no transcription without these binaries.

## Goals

### Primary
1. Ship the **Whisper.cpp CLI** and **FFmpeg** binaries inside the release artifact, per target OS (Windows x64, macOS aarch64).
2. Resolve the bundled binaries at runtime so `config.json` no longer has to point at user-installed paths.
3. Pin and surface the **version** of each bundled binary (visible in Settings and in About, recorded in the release notes).
4. Replace the "Whisper CLI path" picker in Settings with model management (pick / download a model), since the binary is no longer a user concern.
5. Provide a minimal **first-run flow** that gets a new user to a working transcription without editing any files — primarily by helping them download the default model.

### Secondary
1. Structure the resources directory so a future transcription engine (NVIDIA Parakeet, etc.) can be added without redesigning the layout.
2. Document licensing posture for the bundled binaries (especially FFmpeg) so the project's choices are intentional, not accidental.

## Non-Goals

- **Bundling Whisper models**: models are 75 MB – 3 GB; they stay user-downloaded into a known directory. There is also a licensing question on redistributing some model weights that we are choosing to sidestep.
- **Adding NVIDIA Parakeet** (or any second engine): out of scope for this PRD. The directory layout should accommodate it; the implementation does not.
- **Building Linux artifacts**: matches the current [release workflow](../.github/workflows/release-cross-platform.yml), which only produces Windows + macOS-arm64.
- **Intel macOS**: same — current matrix is Apple Silicon only.
- **GPU / CUDA Whisper builds**: bundle CPU-only `whisper-cli` for both OSes for now.
- **In-app auto-update of bundled binaries**: versions are pinned and updated by cutting a new ThoughtCast release.

## Background: How Tauri Bundles Resources

A quick answer to one of the open questions in the source brief, because it shapes the rest of the design.

**`ThoughtCast_x.y.z_x64-setup.exe` is an NSIS installer**, not a self-contained executable. It is essentially a compressed bundle of installation logic plus everything Tauri's bundler told it to include. When the user runs it, NSIS extracts files to `C:\Program Files\ThoughtCast\` (default), including `thoughtcast.exe` and any **resources** declared in [tauri.conf.json](../src-tauri/tauri.conf.json).

We already use this mechanism — the audio cue WAVs ship via:

```json
"resources": [
  "resources/sounds/start.wav",
  "resources/sounds/stop.wav",
  "resources/sounds/ready.wav"
]
```

On disk after install, those files sit next to `thoughtcast.exe` (Windows) or inside `ThoughtCast.app/Contents/Resources/` (macOS). Tauri exposes them at runtime via `resource_dir()` / the `path` plugin. This is the same hook we'll use for `whisper-cli` and `ffmpeg`.

Two important consequences:

- **The binaries stay separate files on disk after install.** They are *not* statically linked into `thoughtcast.exe`. They are bundled in the same installer, but the OS sees them as distinct executables that ThoughtCast happens to invoke. This is exactly the posture FFmpeg's LGPL build is designed for, and what the user identified as the safe path.
- **The installer is per-OS already.** Our [release workflow](../.github/workflows/release-cross-platform.yml) runs separate Windows and macOS jobs. We can populate the `resources/` directory differently per OS without inventing a new pipeline.

## Solution Overview

### Resources Layout

Add a per-tool directory under `src-tauri/resources/` so each transcription engine owns its own subtree:

```
src-tauri/resources/
├── sounds/                       # existing audio cues
└── bin/
    ├── ffmpeg/
    │   ├── windows-x64/
    │   │   ├── ffmpeg.exe
    │   │   └── VERSION           # e.g. "7.0.2-lgpl-shared"
    │   └── macos-arm64/
    │       ├── ffmpeg
    │       └── VERSION
    └── whisper-cpp/
        ├── windows-x64/
        │   ├── whisper-cli.exe
        │   └── VERSION           # e.g. "1.7.4 (commit abcdef0)"
        └── macos-arm64/
            ├── whisper-cli
            └── VERSION
```

Conventions:
- One directory per **tool** (`whisper-cpp`, `ffmpeg`, future `parakeet`).
- One subdirectory per **target triple** (`windows-x64`, `macos-arm64`), naming aligned with Tauri's bundle target labels for grep-ability.
- A plain-text `VERSION` file next to each binary recording (a) upstream version and (b) any build flavor (e.g. `lgpl-shared` for FFmpeg). Read at startup, exposed in Settings and About.

Tauri's `bundle.resources` config will glob include this whole tree; on each OS the bundler only ships the binaries that the runtime resolver will actually look for (see below).

**Models** live separately in the user data dir, organized by tool (so each engine controls its own model format):

```
~/Documents/ThoughtCast/models/
└── whisper-cpp/
    ├── ggml-large-v3-turbo.bin   # downloaded via the in-app flow
    └── ...
```

### Runtime Resolution

A new module (`recording::dependencies`, or similar) becomes the single source of truth for "where is `whisper-cli` / `ffmpeg` on this machine right now?":

1. **Bundled** (default): resolve via Tauri's `resource_dir()` to `bin/<tool>/<target>/<binary>`.
2. **User override** (escape hatch): if `config.json` contains a non-empty `whisperPath` / `ffmpegPath`, prefer it. This preserves my current setup on my dev machine and gives advanced users a way to swap in a GPU-enabled or self-compiled build.

The Rust call sites that today read `config.whisperPath` / `config.ffmpegPath` directly ([engine.rs](../src-tauri/src/recording/transcription/engine.rs), [ffmpeg_runner.rs](../src-tauri/src/recording/compression/ffmpeg_runner.rs), the chunking modules) all change to call `dependencies::resolve(Tool::WhisperCpp)` / `dependencies::resolve(Tool::Ffmpeg)` instead. They never see config paths directly.

### Settings UI Changes

**Transcription tab** becomes model-focused, not binary-focused:

- Drop the "Whisper CLI" path picker.
- Replace "Model file" path picker with a **model selector** showing:
  - The currently selected model and its size on disk.
  - A list of recommended Whisper.cpp models (name, size, language coverage) drawn from a small static manifest in the repo.
  - A "Download" button per model that streams the GGML file from Hugging Face into `~/Documents/ThoughtCast/models/whisper-cpp/` with a progress indicator.
  - A "Use existing file" affordance (file picker) for users who already have a `.bin` lying around.
- Show **bundled tool versions** read-only at the bottom of the tab ("Whisper.cpp 1.7.4 · FFmpeg 7.0.2"), so the user can see what they're running without inspecting files.

**Compression tab** drops the FFmpeg path picker for the same reason; an "advanced" disclosure can expose the override path if/when needed.

### Where Whisper Models Come From

The model selector hits Hugging Face directly. This is the same source the upstream `download-ggml-model.sh` script uses, and the URL pattern is stable and unauthenticated:

```
https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<name>.bin
```

For example, the default model lives at `…/resolve/main/ggml-large-v3-turbo.bin`. The quantized variants (e.g. `ggml-large-v3-turbo-q5_0.bin`) follow the same pattern. No API key, no user-agent shenanigans — a plain HTTPS GET with redirect handling. The repo also publishes tinydiarize models under a different namespace (`akashmjn/tinydiarize-whisper.cpp`), which we ignore for v1.

The static model manifest in the repo therefore needs only `{ name, display_name, size_bytes, hf_filename, recommended }` per entry; the URL is constructed by convention. Each manifest entry should include a SHA-256 so a completed download is verified before being marked usable — Hugging Face exposes blob SHAs in their LFS pointer files, so this is a one-time copy at manifest-bump time.

**Why this and not a mirror**: a comparable app, [Handy](https://github.com/cjpais/Handy), hosts its own CDN (`blob.handy.computer`) and serves a curated set of models. That gives them stable URLs and the ability to repackage. The downside is paying for bandwidth on multi-GB files. We have no reason to take that on for v1 — the HF URLs have been stable for years, and if HF ever rate-limits us we can introduce a mirror later without changing the in-app UX.

**Resumable downloads**: a partial `.bin.partial` file plus HTTP `Range` requests handles the "user closed the lid mid-download" case. Whisper-large-v3-turbo is 1.5 GB; resume is not optional. On success, rename `.partial` → `.bin` after the SHA verifies.

### First-Run Onboarding

When the app starts and `dependencies::resolve(Tool::WhisperCpp)` succeeds **but** no Whisper model is present (no file in the models dir, no `modelPath` override), open a one-screen modal:

> **One more step: choose a transcription model**
>
> ThoughtCast transcribes audio locally using Whisper. We didn't bundle a model because they're large (75 MB – 1.5 GB depending on accuracy).
>
> [ Download Large v3 Turbo · 1.5 GB · recommended ]
> [ Download Base · 142 MB · faster, less accurate ]
> [ I already have one — pick a file ]

This is the *only* mandatory onboarding step. Everything else (audio device, shortcut, compression) keeps reasonable defaults and stays accessible through Settings. If the download fails mid-stream, leave the partial file in a `.partial` filename so a retry doesn't redownload the whole thing.

### Versioning the Bundled Binaries

**How versions get into the bundle**: the CI workflow pulls pinned binary releases at build time, not at runtime. Concretely, the workflow gains a "fetch dependencies" step before `npm run tauri:build`:

- **FFmpeg (Windows x64)**: gyan.dev's `ffmpeg-release-essentials.zip` is the boring, predictable LGPL build. Pin the version tag and extract `ffmpeg.exe`.
- **FFmpeg (macOS arm64)**: pin against [martin-riedl.de](https://ffmpeg.martin-riedl.de/) (signed + notarized arm64 binaries) or [ColorsWind/FFmpeg-macOS](https://github.com/ColorsWind/FFmpeg-macOS) (explicit LGPLv2 universal builds). `evermeet.cx` doesn't ship Apple Silicon at all, so it's out. See open question below for which of the two we pick.
- **Whisper.cpp**: download a pinned release tag's prebuilt CLI from the upstream GitHub release for each OS, drop the binary in place, write `VERSION`.

Pinned versions and source URLs live in a single manifest in the repo (`scripts/dependencies.json` or similar) so a bump is a one-file change. The same manifest is what the runtime VERSION-display reads — there's one canonical declaration.

This keeps the repo small (no committed binaries) while still being deterministic: identical commit → identical bundled versions.

## Licensing Posture

The user explicitly flagged this. Stating the choice so it's deliberate, not implicit:

- **FFmpeg**: ship the **LGPL** build, not the GPL build. The LGPL build excludes non-free encoders (x264, x265, libfdk-aac, etc.) — we don't need any of those for our actual usage (we read WAV input, write AAC via the native `aac` encoder, and run silence detection). The LGPL build is redistributable as a separate binary alongside our app without infecting our license, which is what we want. We invoke it as a subprocess — never statically link.
- **Whisper.cpp**: MIT-licensed; redistribution is unrestricted. No additional posture needed.
- **Whisper model weights**: the GGML models on Hugging Face are released under MIT by ggerganov, but the underlying Whisper weights are MIT-licensed from OpenAI. Redistribution is permitted; we still choose not to bundle them, for size reasons.
- **Documentation**: add a `THIRD_PARTY_LICENSES.md` (or extend an existing one) listing FFmpeg + Whisper.cpp versions and license texts. Tauri can also ship this file as a resource for an in-app "Licenses" view, but the doc itself is the source of truth.

## Implementation Plan

### Phase 1 — Build & Bundle
1. Add `scripts/fetch-dependencies.{ps1,sh}` (or a Node script) that, given a target, downloads the pinned FFmpeg + Whisper.cpp binaries into `src-tauri/resources/bin/<tool>/<target>/` and writes `VERSION`.
2. Wire that script into [.github/workflows/release-cross-platform.yml](../.github/workflows/release-cross-platform.yml) as a step before `npm run tauri:build`, parameterized by the runner's target triple.
3. Add the new paths to `bundle.resources` in [tauri.conf.json](../src-tauri/tauri.conf.json).
4. Add `src-tauri/resources/bin/` to `.gitignore` so we never accidentally commit binaries; the script is the canonical source.

### Phase 2 — Runtime Resolution
5. Introduce `recording::dependencies` with a `Tool` enum and a `resolve(tool) -> PathBuf` function that prefers user override, falls back to bundled, returns a typed error otherwise.
6. Migrate call sites in `recording::transcription` and `recording::compression` (and chunking) to use the resolver. No more reading `whisperPath` / `ffmpegPath` directly outside of `dependencies` and the override-handling layer.
7. Expose a Tauri command `get_bundled_tool_versions` reading the `VERSION` files, used by Settings.

### Phase 3 — Settings + Model Flow
8. Replace the Whisper CLI path picker in [TranscriptionSettingsSection.tsx](../src/features/settings/sections/TranscriptionSettingsSection.tsx) with a model list + download flow backed by new Tauri commands (`list_models`, `download_model`, `select_model`).
9. Add a small static model manifest (name, size, download URL, recommended flag).
10. Drop / hide the FFmpeg path picker in the Compression tab; add an "Advanced override" disclosure for users who need it.
11. Show bundled tool versions at the bottom of the Transcription tab.

### Phase 4 — First-Run + Polish
12. Detect "no usable model" at startup and open the onboarding modal.
13. Write `THIRD_PARTY_LICENSES.md` and link it from the README + the app's About screen.
14. Update [CLAUDE.md](../CLAUDE.md) "Configuration" section: remove the manual `config.json` requirement; document the model download UI as the new setup path.

## Open Questions

1. **FFmpeg macOS source — martin-riedl.de vs ColorsWind**: both are viable LGPL builds for arm64. martin-riedl.de's appeal is that the binaries are already signed and notarized, which sidesteps some Gatekeeper friction even though we don't sign ThoughtCast itself. ColorsWind's appeal is an explicit LGPLv2 declaration on a GitHub release page, which makes the redistribution posture cleaner to document. Pick one for v1 — leaning martin-riedl.de for the notarization, with ColorsWind as a documented fallback if the martin-riedl release cadence ever drifts.

(Override migration and macOS code signing are intentionally out of scope: I'm the only current user, my dev `config.json` will continue to work via the override path, and signing is deferred until there's an audience that warrants the $99/yr Apple Developer fee.)

## Success Criteria

1. A fresh user can download `ThoughtCast_x.y.z_x64-setup.exe` (or the `.dmg`), install, launch, click through one model-download prompt, and have a working recording → transcription → clipboard flow. No editing of `config.json`. No installing Whisper.cpp. No installing FFmpeg.
2. Settings → Transcription shows the bundled Whisper.cpp and FFmpeg versions, and the user's currently selected model.
3. The release artifacts contain exactly one set of binaries each (Windows artifact has no macOS binaries and vice versa), and the version files in the bundle match the version strings shown in the app.
4. My existing dev machine, where `config.json` already points to a local Whisper.cpp build, continues to work unchanged using those paths as overrides.
5. `THIRD_PARTY_LICENSES.md` is present and accurate at release time.

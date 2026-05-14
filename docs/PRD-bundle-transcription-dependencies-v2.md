# PRD: Install and Go — Self-Contained Transcription

## Problem Statement

ThoughtCast records voice and transcribes it locally, but today none of that works after a fresh install. Before the app can do anything useful, a user has to compile Whisper.cpp from source, install FFmpeg, download a multi-gigabyte Whisper model, then hand-edit a `config.json` to point at all three. That is a "follow a setup guide for 30 minutes" experience standing between launch and the first transcription.

This is fine on my one dev workstation. It falls apart the moment I want to use ThoughtCast on a second machine or treat this as a real release artifact. The friction lives in exactly the place a user can't bypass — there is no recording without the binaries, and no transcription without the model.

I also have a related, pre-existing problem with storage. I currently dump everything (recordings, models, config) into `Documents/ThoughtCast/` because it's the only path I know about. Recordings belong there — the user wants to find them — but binaries and models belong somewhere the user isn't poking around in.

Scope: this update bundles Whisper.cpp (the transcription engine) and the model-download flow. It deliberately does **not** bundle FFmpeg. Trying to ship an LGPL-clean macOS arm64 FFmpeg build turned out to be a real swamp — there is no FFmpeg-project-sanctioned arm64 binary, every community redistribution I looked at (martin-riedl, etc.) ships a GPL build by default, and the LGPL-clean path collapses to "build it ourselves in CI." Not worth the complexity for an app that's mostly used by me on machines where I already have FFmpeg installed. FFmpeg stays a user-installed prerequisite with clear in-app guidance when it's missing.

I want the design to also leave the door open for adding a second transcription engine (NVIDIA Parakeet) later without redoing this work.

## User Experience Goals

**Current Behavior (Problematic)**:
1. User downloads the installer, runs it, launches the app.
2. App can't transcribe — config is missing. User digs through README, compiles Whisper.cpp from source, installs FFmpeg, downloads a model, edits `config.json` by hand.
3. User abandons or successfully reaches step 2 after roughly half an hour.

**Desired Behavior**:
1. User downloads the installer, runs it, launches the app.
2. App walks the user through the remaining setup: pick a Whisper model (downloaded in-app with progress), and confirm FFmpeg is installed (the app detects it on `PATH` first, and falls back to a one-screen install guide with OS-specific instructions if it's not found).
3. User records something and it transcribes. Total hands-on time: a few minutes, plus model download time.

**Key Requirements**:
- The release installer ships with Whisper.cpp inside it. The user never installs or locates the `whisper-cli` binary.
- First launch with no model triggers a single, clear prompt to pick one and downloads it for the user.
- FFmpeg is detected from the system `PATH` or a configured override path. If missing, the user sees a focused install-instructions screen rather than a silent failure mid-transcription.
- Recordings and transcripts continue to live in the user's `Documents` folder, where they can be found, backed up, and shared. App-managed files (Whisper.cpp binary, models) live somewhere the user isn't expected to touch.
- Settings shows the user what version of Whisper.cpp is currently bundled, what FFmpeg version was detected (or "not found"), and what model is in use.
- A path to a second transcription engine (Parakeet) is preserved — the directory layout and the engine/model selector UI in v1 must absorb it without redesign.
- My existing dev `config.json` with hand-coded paths keeps working as an advanced override, so I'm not the casualty of my own release.

## User Scenarios

### Scenario 1: Fresh Install on a Machine That Already Has FFmpeg
I move to a new laptop where I already have FFmpeg available on `PATH` (the common case for me — Homebrew on macOS, scoop or chocolatey on Windows). I download the latest installer, run it, launch ThoughtCast. The app picks up FFmpeg silently, notices I have no Whisper model, and opens a one-screen model picker. I pick one, watch a progress bar, and within a few minutes I'm transcribing. I never opened a terminal or edited a config file.

### Scenario 2: Fresh Install Without FFmpeg
I install ThoughtCast on a machine that doesn't have FFmpeg. The app launches, doesn't find FFmpeg anywhere, and shows a focused screen: "ThoughtCast uses FFmpeg to compress and chunk recordings. We don't bundle it because of FFmpeg's licensing model — but it's a one-line install." Below that: OS-specific commands (`brew install ffmpeg` on macOS, `winget install Gyan.FFmpeg` or `scoop install ffmpeg` on Windows). After I install it, ThoughtCast either auto-detects on next launch or I point it at the binary with a file picker. Recording and transcription work either way; compression and long-recording features are gated on FFmpeg being present.

### Scenario 3: Curious About the New Engine
A few releases in, Parakeet has been added as a second engine. I open Settings → Transcription, see two engines listed (Whisper.cpp and Parakeet), each with their own model picker. I switch to Parakeet to compare speed against my current Whisper setup. The engine selector and model selector are clearly distinct — choosing an engine doesn't silently invalidate my Whisper model, and switching back keeps my previous selection intact.

### Scenario 4: I'm Still on My Dev Box
On my development machine I have a hand-tuned Whisper.cpp build (GPU-enabled, custom compile flags) at a known path. My existing `config.json` has `whisperPath` and `ffmpegPath` pointing at my local installs. After upgrading to the bundled-Whisper release, ThoughtCast detects my Whisper override and keeps using my local build instead of the bundled one. My FFmpeg override continues to work as before. The bundled Whisper binary is a safety net; it doesn't replace what I've intentionally configured.

## Edge Cases to Consider

1. **First launch, no internet**: The bundled Whisper binary works without a network, but the model still needs downloading. User should see a clear "you'll need internet for the first model download" message rather than a generic connection error mid-download. If they dismiss the prompt and reopen the app offline, the prompt comes back next launch — recording is disabled until a model is present.

2. **Model download interrupted**: User closes the laptop lid, kills the app, or loses Wi-Fi at 60% of a multi-hundred-MB download. Next launch, the partial file is detected and the user is offered "Resume download" rather than starting over from zero.

3. **User picks a model, then deletes the file on disk**: Either by hand or via a "manage downloaded models" action. The next recording attempt should not crash — it should send them back to the model picker with a "the selected model is missing" note.

4. **User has an existing model file from another tool**: They have a `ggml-base.bin` on disk from some other project. The model picker should offer "Use an existing file" as an alternative to downloading, and accept their pre-existing `.bin` after a quick sanity check.

5. **FFmpeg is missing or stops being available**: User uninstalls FFmpeg, or it disappears from `PATH` between sessions. Transcription of short recordings keeps working (Whisper handles WAV directly); compression and long-recording chunking gracefully degrade with a clear "FFmpeg not found — here's how to install it" message rather than a silent crash mid-pipeline.

6. **User without admin rights on Windows**: The NSIS installer's default install path is `C:\Program Files\ThoughtCast\`. If the user can't write there, they need a clear error or a per-user install option — not a silent failure that leaves the bundled Whisper binary unreachable.

7. **Override path set in `config.json` points at a binary that no longer exists**: User had a path to a Whisper.cpp build they've since deleted. The resolver should fall back to the bundled binary with a one-time notice, rather than failing transcription.

8. **Disk full mid-download**: User's drive runs out of space at 90%. The app should clean up the partial file (or leave a `.partial` and surface the failure clearly), free space if possible, and not corrupt the existing model selection.

## What Users Should See

**First-Run Model Picker (mandatory one-time step)**:
```
ThoughtCast is almost ready

To transcribe recordings, choose a speech model. Models stay on
your computer — nothing leaves your machine.

  (   ) Whisper Tiny                75 MB
  (   ) Whisper Base               142 MB
  (   ) Whisper Small              466 MB
  (   ) Whisper Medium             1.5 GB
  ( o ) Whisper Large v3 Turbo     1.5 GB
  (   ) Whisper Large v3           2.9 GB
  (   ) I already have a .bin file  [Browse...]

                                           [ Download model ]
```

**Model download in progress**:
```
Downloading Whisper Large v3 Turbo
[##############---------] 62%   942 MB of 1.5 GB
                          ~3 min remaining
                                            [ Cancel ]
```

**Settings → Transcription tab**:
```
Engine:    [ Whisper.cpp           v ]

Model:     Whisper Large v3 Turbo
           1.5 GB · in use
                                          [ Change model... ]

Available models:
  - Whisper Tiny               75 MB    [ Download ]
  - Whisper Base               142 MB   [ Download ]
  - Whisper Small              466 MB   [ Download ]
  - Whisper Medium             1.5 GB   [ Download ]
  - Whisper Large v3 Turbo     1.5 GB   ✓ downloaded
  - Whisper Large v3           2.9 GB   [ Download ]

Bundled engine:  Whisper.cpp 1.7.4

Advanced: [ Use a custom Whisper CLI path... ]
```

**Settings → Compression tab (FFmpeg)**:
```
FFmpeg:    /usr/local/bin/ffmpeg
           Detected version 7.0.2
                                          [ Change path... ]

(or, if missing:)

FFmpeg:    ⚠ Not found
           ThoughtCast needs FFmpeg for audio compression
           and to chunk long recordings.

           macOS:    brew install ffmpeg
           Windows:  winget install Gyan.FFmpeg
                                          [ I have it installed — pick the file ]
```

**About / version info display**:
```
ThoughtCast 0.5.0

Built-in engine:
  Whisper.cpp     1.7.4

External tool:
  FFmpeg          7.0.2 (detected at /usr/local/bin/ffmpeg)

Active transcription model:
  ggml-large-v3-turbo.bin  (Whisper Large v3 Turbo)

Recordings are saved to:  ~/Documents/ThoughtCast/
Models are managed in:    (app data folder)
```

## Success Criteria

From the user's perspective:
- A new user with FFmpeg already on `PATH` installs ThoughtCast, clicks through one model-picker prompt, and produces their first transcription without touching a terminal or a config file.
- A new user without FFmpeg sees a clear, OS-specific install screen — not a stack trace and not a silent failure.
- The first-run model download is visible (progress, ETA), cancelable, and resumable.
- Recordings and transcripts stay in `Documents/ThoughtCast/` where the user expects to find them; the user does not have to know about or visit the app-managed folder where models live.
- Settings clearly shows which Whisper model is in use, which Whisper.cpp version is bundled, and which FFmpeg version is detected (or that FFmpeg is missing).
- A user who already had ThoughtCast configured manually (me on my dev box) keeps working without intervention after the upgrade.

## Out of Scope

- **Bundling FFmpeg** → Deliberately excluded. The macOS arm64 LGPL story is a swamp: no FFmpeg-project-sanctioned arm64 build, every prominent community redistribution (e.g. martin-riedl.de) ships a GPL build by default with `libx264`/`libx265` enabled, and the LGPL-clean path collapses to building it ourselves in CI. Not worth the complexity for an app I'm the primary user of and where I already have FFmpeg installed everywhere I care about. FFmpeg stays a user-installed prerequisite with in-app install guidance.
- **NVIDIA Parakeet engine (v1)** → Future Extension. The directory layout and engine selector accommodate it; the integration itself is a follow-up release.
- **Bundling Whisper model weights into the installer** → Models stay user-downloaded. They are 75 MB – 2.9 GB and would inflate the installer disproportionately.
- **Override migration / config rewriting on upgrade** → I'm the only existing user, my override keeps working, no migration needed.
- **macOS code signing and notarization** → Deferred until there's an audience that warrants the Apple Developer fee. Users will continue to right-click → Open on first launch.
- **Linux builds and Intel macOS builds** → Matches the current release matrix (Windows x64, macOS arm64 only).
- **GPU / CUDA Whisper builds** → Bundle CPU-only `whisper-cli` on both platforms. Users with GPU setups continue to use the override path.
- **In-app auto-update of the bundled Whisper.cpp binary** → A new bundled version ships as part of a new ThoughtCast release, not as a separate update.
- **Search / management of downloaded models** beyond the picker → A dedicated "downloaded models" manager with size totals, last-used dates, and a "remove" action is a future polish, not a v1 requirement.

## Future Extensions

The largest planned follow-up is **adding NVIDIA Parakeet** as a second transcription engine. Parakeet is CC-BY-4.0 (redistribution is fine), the int8-quantized v3 model is around 670 MB unpacked, and it runs CPU-only via ONNX Runtime — meaningfully faster than Whisper Large v3 Turbo on the same machine, with accuracy that's good enough for everyday use. The speed-vs-accuracy tradeoff makes it a strong candidate to eventually become ThoughtCast's default engine, possibly with its model bundled directly into the installer rather than downloaded post-install. That decision is for the Phase 2 PRD.

**Revisiting FFmpeg bundling later** is also on the table — but only if the macOS arm64 LGPL ecosystem matures (or if I'm willing to spend the ~15-20 minutes of CI build time and the maintenance overhead). Until then, the documented user-install path is the deliberate choice, not a known-bad workaround.

Two smaller follow-ups become natural once v1 ships: a "manage downloaded models" view (see sizes, free up disk space), and a Hugging Face mirror if their CDN ever rate-limits us. Neither is needed to call v1 done.

## Architecture Notes

- **Tauri's `bundle.resources`** is the mechanism for shipping `whisper-cli` (and, later, ONNX Runtime for Parakeet) alongside the app. Per-OS contents are selected by the existing per-OS release jobs — Windows artifact ships the Windows `whisper-cli.exe`, macOS artifact ships the arm64 `whisper-cli`. Whisper.cpp is MIT-licensed, so no licensing complications.
- **Storage split**: bundled binaries resolve via `resource_dir()` (read-only, lives with the app install). Models live in `app_data_dir()`, subdivided per engine (`models/whisper-cpp/`, future `models/parakeet/`). User recordings and transcripts stay in `~/Documents/ThoughtCast/`, where the user can find them.
- **FFmpeg discovery**: at startup, check `config.json` override path first, then probe the system `PATH`. If found, capture and display the version (`ffmpeg -version` first line). If missing, route the user to the install-instructions screen rather than failing transcription mid-pipeline. Short recordings (no compression, no chunking) should still work without FFmpeg.
- **Whisper models come from Hugging Face directly** via the stable, unauthenticated URL pattern `huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<name>.bin`. Resumable via HTTP `Range` requests; SHA-256 verification on completion.
- **Parakeet is materially more work than Whisper.cpp** — it's not "ship another CLI binary," it's "embed ONNX Runtime as a Rust dependency plus tokenizer plus inference loop." The reference implementation is Handy's `transcribe-rs` crate. Flag as a Phase 2 risk, not a stretch goal tacked onto v1.

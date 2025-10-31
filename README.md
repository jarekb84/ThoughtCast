# 🎙️ ThoughtCast · Voice → Text, Locally.
> Capture ideas at the speed of thought. Record, transcribe, and transform your voice into text — all offline, all yours.

ThoughtCast is a cross-platform desktop app that captures your spoken ideas and instantly converts them to text using local Whisper transcription.
It's designed as a high-bandwidth entry point for thought — speak freely, and ThoughtCast transforms your stream of consciousness into usable text for docs, PRDs, or AI workflows.

🧠 Speak → Transcribe → Copy → Create.

Everything runs locally — no cloud services, no external APIs — making it private, fast, and extensible for future integrations like LM Studio or local model post-processing.

## Current Status: Skeleton/MVP ⚠️

This is the **basic skeleton implementation** with UI layout and navigation only. Recording and transcription features are coming in the next phases.

### ✅ What Works Now
- Basic Tauri desktop app runs on Windows and macOS
- Two-panel layout (sidebar + main panel)
- Mock sessions with clickable navigation
- Session selection updates the UI

### 🚧 Coming Soon
- Microphone recording
- Whisper.cpp transcription
- Persistent storage
- Clipboard integration

## Quick Start

**Prerequisites:**
- Node.js 18+
- Rust (install from [rustup.rs](https://rustup.rs/))
- Platform-specific build tools (see [BUILD_GUIDE.md](BUILD_GUIDE.md))

**Run the app:**
```bash
npm install
npm run tauri:dev
```

**Build for production:**
```bash
npm run tauri:build
```

For detailed setup instructions, see [BUILD_GUIDE.md](BUILD_GUIDE.md).

## Documentation

- [BUILD_GUIDE.md](BUILD_GUIDE.md) - Complete build and setup instructions
- [docs/ProjectGoals.md](docs/ProjectGoals.md) - Full product requirements document

## Project Structure

```
src/                  # React frontend
  ├── components/     # SessionList, MainPanel
  ├── App.tsx         # Main app with state management
  └── mockData.ts     # Sample session data

src-tauri/            # Rust backend
  ├── src/lib.rs      # Tauri app initialization
  └── tauri.conf.json # Window configuration
```

## Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri
- **Future**: Whisper.cpp, cpal (audio capture)

## License

See [LICENSE](LICENSE)
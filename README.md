# 🎙️ ThoughtCast · Voice → Text, Locally.
> Capture ideas at the speed of thought. Record, transcribe, and transform your voice into text — all offline, all yours.

ThoughtCast is a cross-platform desktop app that captures your spoken ideas and instantly converts them to text using local Whisper transcription.
It's designed as a high-bandwidth entry point for thought — speak freely, and ThoughtCast transforms your stream of consciousness into usable text for docs, PRDs, or AI workflows.

🧠 Speak → Transcribe → Copy → Create.

Everything runs locally — no cloud services, no external APIs — making it private, fast, and extensible for future integrations like LM Studio or local model post-processing.

## Current Status: Recording + Transcription MVP ✅

ThoughtCast now includes **microphone recording with automatic Whisper transcription**!

### ✅ What Works Now
- ✅ Microphone recording with live timer
- ✅ Automatic Whisper.cpp transcription after recording
- ✅ Persistent storage of audio files and transcripts
- ✅ Session history with searchable transcript previews
- ✅ Full transcript display for each session
- ✅ Cross-platform desktop app (Windows & macOS)

### 🚧 Coming Soon
- Clipboard integration (auto-copy transcripts)
- Audio file import
- Search and filter transcripts
- Export sessions

## Quick Start

**Prerequisites:**
- Node.js 18+
- Rust (install from [rustup.rs](https://rustup.rs/))
- **Whisper.cpp** compiled locally ([build guide](https://github.com/ggerganov/whisper.cpp))
- **Whisper model file** downloaded (e.g., `ggml-base.bin` or `ggml-large-v3-turbo.bin`)
- Platform-specific build tools (see [BUILD_GUIDE.md](docs/BUILD_GUIDE.md))

**Setup:**

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create config.json:**

   Copy the example config and update paths:
   ```bash
   # On Windows, the config goes in: C:\Users\YourName\Documents\ThoughtCast\config.json
   # On macOS, the config goes in: ~/Documents/ThoughtCast/config.json
   ```

   Example `config.json`:
   ```json
   {
     "whisperPath": "C:\\Source\\whisper.cpp\\build\\bin\\Release\\whisper-cli.exe",
     "modelPath": "C:\\Source\\whisper.cpp\\models\\ggml-large-v3-turbo.bin"
   }
   ```

   See [config.example.json](config.example.json) for reference.

3. **Run the app:**
   ```bash
   npm run tauri:dev
   ```

4. **Build for production:**
   ```bash
   npm run tauri:build
   ```

For detailed setup instructions, see [BUILD_GUIDE.md](docs/BUILD_GUIDE.md).

## Documentation

- [BUILD_GUIDE.md](BUILD_GUIDE.md) - Complete build and setup instructions
- [docs/ProjectGoals.md](docs/ProjectGoals.md) - Full product requirements document

## Project Structure

```
src/                       # React frontend
  ├── components/          # UI components
  │   ├── SessionList.tsx  # Sidebar with session history
  │   └── MainPanel.tsx    # Recording controls and transcript display
  ├── App.tsx              # Main app with state management
  └── types.ts             # TypeScript interfaces

src-tauri/                 # Rust backend
  ├── src/
  │   ├── lib.rs           # Tauri commands
  │   └── recording.rs     # Audio recording and transcription
  ├── Cargo.toml           # Rust dependencies
  └── tauri.conf.json      # App configuration

Documents/ThoughtCast/     # User data directory (created on first run)
  ├── config.json          # Whisper configuration (you create this)
  ├── sessions.json        # Session index
  ├── audio/               # Recorded audio files
  └── text/                # Transcript files
```

## Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri
- **Audio**: cpal (cross-platform audio I/O)
- **Transcription**: Whisper.cpp (local AI model)
- **Storage**: JSON files + filesystem

## License

See [LICENSE](LICENSE)
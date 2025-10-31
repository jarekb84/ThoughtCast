# ThoughtCast - Build Guide

This guide will help you set up and run the ThoughtCast desktop application.

## Prerequisites

Before you can build and run ThoughtCast, you need to install the following:

### 1. Node.js and npm
- Download and install from [nodejs.org](https://nodejs.org/)
- Verify installation:
  ```bash
  node --version
  npm --version
  ```

### 2. Rust
- Install Rust from [rustup.rs](https://rustup.rs/)
- On Windows: Download and run `rustup-init.exe`
- On macOS/Linux: Run `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Verify installation:
  ```bash
  rustc --version
  cargo --version
  ```

### 3. Platform-Specific Dependencies

#### Windows
- Install Microsoft Visual Studio C++ Build Tools
- Download from [Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Select "Desktop development with C++" workload

#### macOS
- Install Xcode Command Line Tools:
  ```bash
  xcode-select --install
  ```

#### Linux
- Install required packages (Debian/Ubuntu):
  ```bash
  sudo apt update
  sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
  ```

## Installation

1. Clone the repository (or navigate to the project directory)
2. Install dependencies:
   ```bash
   npm install
   ```

## Development

To run the app in development mode:

```bash
npm run tauri:dev
```

This will:
1. Start the Vite development server (React frontend)
2. Compile the Rust backend
3. Launch the application window

### First Run
The first time you run `npm run tauri:dev`, it will take several minutes as Rust compiles all dependencies. Subsequent runs will be much faster.

## Building for Production

To create a production build:

```bash
npm run tauri:build
```

The built application will be in `src-tauri/target/release/bundle/`

### Build Outputs by Platform

- **Windows**: `.exe` installer in `bundle/nsis/`
- **macOS**: `.app` bundle and `.dmg` in `bundle/dmg/` and `bundle/macos/`
- **Linux**: `.deb`, `.AppImage`, etc. in respective bundle folders

## Current Status

This is the **skeleton/MVP version** of ThoughtCast. The current features include:

### ✅ Implemented
- Basic Tauri + React application structure
- Two-panel layout (sidebar + main panel)
- Mock session data (5 sample sessions)
- Session list with clickable items
- Session selection state management
- UI updates when clicking sessions
- Proper window configuration (1200x800)

### ⚠️ Not Yet Implemented
- Microphone recording
- Audio transcription
- File system operations
- Configuration management
- Clipboard integration

## Project Structure

```
ThoughtCast/
├── src/                      # React frontend source
│   ├── components/           # React components
│   │   ├── SessionList.tsx   # Sidebar session list
│   │   ├── SessionList.css
│   │   ├── MainPanel.tsx     # Main content area
│   │   └── MainPanel.css
│   ├── App.tsx               # Main app component
│   ├── App.css
│   ├── main.tsx              # React entry point
│   ├── types.ts              # TypeScript types
│   └── mockData.ts           # Mock session data
├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── main.rs           # Rust entry point
│   │   └── lib.rs            # Main Tauri app logic
│   ├── Cargo.toml            # Rust dependencies
│   └── tauri.conf.json       # Tauri configuration
├── package.json              # npm dependencies and scripts
├── vite.config.ts            # Vite configuration
└── tsconfig.json             # TypeScript configuration
```

## Available Scripts

- `npm run dev` - Start Vite development server only
- `npm run build` - Build React app for production
- `npm run preview` - Preview production build
- `npm run tauri:dev` - Run full Tauri app in development mode
- `npm run tauri:build` - Build production Tauri app

## Troubleshooting

### "Rust not found" error
- Make sure Rust is installed: `rustc --version`
- Restart your terminal/IDE after installing Rust
- On Windows, ensure the Rust bin directory is in your PATH

### Build fails on first run
- Be patient - first build can take 5-10 minutes
- Ensure you have all platform-specific dependencies installed
- Check you have enough disk space (Rust builds can be large)

### Window doesn't appear
- Check the console for errors
- Ensure port 5173 is not already in use
- Try running `npm run dev` first to verify Vite works

## Next Steps

After verifying the skeleton works, the next implementation phases are:

1. **Phase 2**: Microphone recording functionality
2. **Phase 3**: Whisper.cpp integration for transcription
3. **Phase 4**: Persistent storage and session management
4. **Phase 5**: Clipboard integration and polish

## Getting Help

- Check the [Tauri documentation](https://tauri.app/)
- Review the [project PRD](docs/ProjectGoals.md)
- Check GitHub issues for common problems

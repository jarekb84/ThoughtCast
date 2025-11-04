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

### Option 1: GitHub Actions (Recommended for Releases)

The recommended way to create production builds is using GitHub Actions, which automatically builds for both Windows and macOS.

**Steps:**
1. Go to the repository on GitHub
2. Navigate to **Actions** → **Build and Release**
3. Click **Run workflow**
4. Enter a version tag (e.g., `v0.1.0`)
5. Click **Run workflow** button

The workflow will:
- Build Windows `.exe` installer on Windows runner
- Build macOS `.dmg` installer on macOS runner (Apple Silicon)
- Create a GitHub release with both installers attached

**Download the Release:**
- Go to **Releases** section on GitHub
- Download the appropriate installer for your platform:
  - Windows: `ThoughtCast_<version>_x64-setup.exe`
  - macOS: `ThoughtCast_<version>_aarch64.dmg`

### Option 2: Local Build

To create a local production build:

```bash
npm run tauri:build
```

The built application will be in `src-tauri/target/release/bundle/`

**Build Outputs by Platform:**
- **Windows**: `.exe` installer in `bundle/nsis/`
- **macOS**: `.app` bundle and `.dmg` in `bundle/dmg/` and `bundle/macos/`
- **Linux**: `.deb`, `.AppImage`, etc. in respective bundle folders

**Note:** macOS builds require a Mac (cannot cross-compile from Windows). Use GitHub Actions for macOS builds if you're developing on Windows.

## Current Status

ThoughtCast is a fully functional voice transcription app with the following features:

### ✅ Implemented
- Microphone recording with live timer
- Automatic Whisper.cpp transcription after recording
- Persistent storage of audio files and transcripts
- Session history with searchable transcript previews
- Full transcript display for each session
- Clipboard integration (auto-copy transcripts with selection)
- Cross-platform desktop app (Windows & macOS)

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

### macOS: Microphone permission issues
If recording fails on macOS with "No microphone access" error:
- The app should appear in **System Settings → Privacy & Security → Microphone**
- If permission dialog doesn't appear on first recording attempt, check that `Info.plist` is included in the app bundle
- To manually grant permission: Open **System Settings → Privacy & Security → Microphone**, find **ThoughtCast**, and toggle it on
- After granting permission, restart the recording - no app restart needed

#### Testing macOS Permissions

**Test Case 1: Fresh Install - Grant Permission**
1. Install app on macOS with no prior permission state
2. Click "Start Recording"
3. Verify system permission dialog appears with usage description
4. Click "OK" to grant permission
5. Verify recording proceeds and audio is captured

**Test Case 2: Fresh Install - Deny Permission**
1. Install app on macOS with no prior permission state
2. Click "Start Recording"
3. Verify system permission dialog appears
4. Click "Don't Allow"
5. Verify error message displays with clear System Settings path

**Test Case 3: Permission Revocation**
1. Grant permission (Test Case 1)
2. Open **System Settings → Privacy & Security → Microphone**
3. Disable ThoughtCast permission
4. Return to app and click "Start Recording"
5. Verify error message displayed
6. Re-enable permission in System Settings
7. Click "Start Recording" again (no app restart needed)
8. Verify recording works

## Getting Help

- Check the [Tauri documentation](https://tauri.app/)
- Review the [project PRD](docs/ProjectGoals.md)
- Check GitHub issues for common problems

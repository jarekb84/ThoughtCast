# PRD: macOS Build Support

## Problem Statement

ThoughtCast was chosen with Tauri specifically for its cross-platform capabilities (Windows, macOS, Linux). However, the application has only been developed and built on Windows so far. To use ThoughtCast on a MacBook Pro (work laptop), we need to:

1. **Fix the bundle identifier warning**: Current identifier `com.thoughtcast.app` conflicts with macOS bundle extension (`.app`)
2. **Enable macOS builds**: Determine the build strategy (local Mac, CI/CD, or cross-compilation)
3. **Verify macOS functionality**: Ensure the app works correctly on macOS with native features

## Background

### Current Warning
When building with the current configuration, Tauri warns:
```
The bundle identifier "com.thoughtcast.app" ends with ".app".
This is not recommended because it conflicts with the application
bundle extension on macOS.
```

### Cross-Platform Build Constraints

**macOS Code Signing Requirements**:
- macOS applications must be signed with Apple Developer certificates
- Apple's toolchain (Xcode) is required for native macOS builds
- Cross-compilation from Windows → macOS is **not supported** for signed/distributable apps

**Technical Limitation**: You **cannot** build a production-ready macOS `.app` bundle on Windows due to:
- Apple's code signing requirements
- macOS-specific frameworks and linking
- XCode Command Line Tools dependency

## Goals

### Primary Goals
1. Fix bundle identifier to comply with Apple's naming conventions
2. Set up GitHub Actions for automated macOS and Windows builds
3. Generate distributable release artifacts (.dmg for macOS, .exe for Windows)
4. Verify core functionality works on macOS (recording, transcription, clipboard)

### Secondary Goals (Fallback/Reference)
1. Document local macOS build process for fallback scenarios
2. Create macOS-specific troubleshooting guide
3. Document manual testing procedures on MacBook Pro

## Solution Options

### Option 1: GitHub Actions CI/CD (Recommended - Primary Approach)
**Approach**: Automated builds on GitHub's hosted runners

**Pros**:
- ✅ Build both Windows and macOS from same workflow
- ✅ No need to set up local Mac development environment
- ✅ Consistent, reproducible builds
- ✅ Automatic artifact generation for releases
- ✅ Can trigger builds from Windows development machine
- ✅ Free for public repos (2000 min/month)

**Cons**:
- Requires GitHub Actions configuration
- ~10-15 minute build time per platform
- Debugging CI issues requires commit/push cycle

**Workflow Strategy**:
```yaml
name: Build and Release
on:
  workflow_dispatch:  # Manual trigger only
    inputs:
      version:
        description: 'Release version (e.g., v0.1.0)'
        required: true

jobs:
  build-windows:
    runs-on: windows-latest
    # ... build .exe installer

  build-macos:
    runs-on: macos-latest  # Apple Silicon runner
    # ... build .dmg installer

  create-release:
    needs: [build-windows, build-macos]
    # ... create GitHub release with artifacts
```

### Option 2: Local macOS Build (Fallback Reference)
**Approach**: Build directly on the MacBook Pro

**Use Cases**:
- GitHub Actions troubleshooting
- Quick local testing before committing
- Understanding macOS-specific build issues

**Pros**:
- Full control over build environment
- Faster iteration for debugging
- No CI minutes consumed

**Cons**:
- Requires MacBook setup (Xcode, Rust, Node.js)
- Manual build process
- Only builds macOS (still need Windows builds elsewhere)

**Quick Setup**:
```bash
# On MacBook Pro
git clone <repo-url>
cd ThoughtCast
xcode-select --install
npm install
npm run tauri:build
```

**Note**: This is documented primarily as a **reference/fallback** option. Primary development and releases will use GitHub Actions.

## Requirements

### 1. Configuration Changes

#### Fix Bundle Identifier
**Current**: `com.thoughtcast.app` ❌
**Proposed**: `com.thoughtcast.desktop` ✅

Update in [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json#L5):
```json
{
  "identifier": "com.thoughtcast.desktop"
}
```

**Rationale**:
- Avoids `.app` conflict
- Follows reverse-domain naming (com.domain.product)
- `desktop` clarifies it's the desktop app (vs potential web/mobile versions)

#### Verify Icon Assets
Ensure `icons/icon.icns` exists and is properly formatted for macOS:
- Located at `src-tauri/icons/icon.icns`
- Contains multiple resolutions (16x16 to 512x512)
- Follows Apple's icon guidelines

### 2. GitHub Actions Workflow Setup (Primary Implementation)

**File**: `.github/workflows/release-cross-platform.yml`

**Triggers**:
- Manual trigger only via `workflow_dispatch`
- Accepts version input (e.g., `v0.1.0`) for release tagging

**Jobs**:
1. **build-windows**: Builds Windows `.exe` installer on `windows-latest`
2. **build-macos**: Builds macOS `.dmg` installer for Apple Silicon on `macos-latest`
3. **create-release**: Creates GitHub release and attaches build artifacts

**Outputs**:
- Windows: `.exe` installer (NSIS format)
- macOS: `.dmg` disk image (Apple Silicon/ARM64)
- Both attached to GitHub release for download

**Key Considerations**:
- Manual trigger only - no automatic builds on push
- Version input for release tagging
- Apple Silicon (ARM64) target for macOS builds
- Create GitHub release with both platform installers attached

**Workflow Example Structure**:
```yaml
name: Build and Release
on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Release version (e.g., v0.1.0)'
        required: true

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: dtolnay/rust-toolchain@stable
      - name: Install dependencies
        run: npm install
      - name: Build Windows app
        run: npm run tauri:build
      - name: Upload Windows artifact
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: src-tauri/target/release/bundle/nsis/*.exe

  build-macos:
    runs-on: macos-latest  # Apple Silicon runner
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: dtolnay/rust-toolchain@stable
      - name: Install dependencies
        run: npm install
      - name: Build macOS app
        run: npm run tauri:build
      - name: Upload macOS artifact
        uses: actions/upload-artifact@v4
        with:
          name: macos-installer
          path: src-tauri/target/release/bundle/dmg/*.dmg

  create-release:
    needs: [build-windows, build-macos]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: ${{ github.event.inputs.version }}
          name: Release ${{ github.event.inputs.version }}
          files: |
            windows-installer/*
            macos-installer/*
```

### 3. Documentation Updates

Update [docs/BUILD_GUIDE.md](../docs/BUILD_GUIDE.md):
- Add section on GitHub Actions manual release builds
- Document how to trigger workflow dispatch with version input
- Add instructions for downloading release artifacts
- Include local macOS build instructions (for reference)

Update [CLAUDE.md](../CLAUDE.md):
- Document GitHub Actions workflow location and manual trigger process
- Add notes about release creation workflow
- Update development commands section with release artifact info

### 4. macOS Testing & Verification

#### Testing Strategy
Once GitHub Actions workflow is set up:

1. **Trigger Build**: Manually dispatch workflow from GitHub Actions UI with version (e.g., `v0.1.0-test`)
2. **Download Release**: Get `.dmg` from GitHub Releases page
3. **Transfer to Mac**: Copy `.dmg` to MacBook Pro (M1)
4. **Install & Test**: Run functional tests on Apple Silicon

#### Functional Testing Checklist
On macOS, verify:
- [ ] App launches without errors
- [ ] Window renders correctly (no UI glitches)
- [ ] Microphone recording works (requires permission prompt)
- [ ] Audio saves to `~/Documents/ThoughtCast/audio/`
- [ ] Whisper transcription completes successfully
- [ ] Transcript copies to clipboard
- [ ] Session history displays correctly
- [ ] Config loaded from `~/Documents/ThoughtCast/config.json`

#### Expected Build Outputs
- **macOS**: `ThoughtCast_0.1.0_aarch64.dmg` (Apple Silicon/ARM64)
- **Windows**: `ThoughtCast_0.1.0_x64-setup.exe`

**Note**: Whisper.cpp integration already configured on M1 MacBook. Initial testing focuses on verifying app runs and UI works - transcription configuration/arguments can be adjusted later if needed.

## Non-Goals (Out of Scope)

- **Universal macOS binaries**: Build for Apple Silicon only (current hardware)
- **Intel macOS support**: Not targeting Intel Macs in this phase
- **Automatic builds on push**: Manual workflow dispatch only
- **macOS-specific features**: Advanced integrations like Touch Bar, Handoff, etc.
- **App Store distribution**: No code signing or notarization for App Store (can add later)
- **Automatic updates**: No built-in updater (manual downloads for now)
- **Linux builds**: Not addressed in this PRD (separate effort)
- **Whisper.cpp configuration UI**: Already configured on Mac; UI for settings is future work

## Success Criteria

### Must Have (MVP)
1. ✅ Bundle identifier updated to `com.thoughtcast.desktop`
2. ✅ GitHub Actions workflow configured with manual `workflow_dispatch` trigger
3. ✅ Windows `.exe` builds successfully via GitHub Actions
4. ✅ macOS `.dmg` builds successfully for Apple Silicon via GitHub Actions
5. ✅ GitHub release created automatically with both platform installers attached
6. ✅ Core recording + transcription workflow verified on MacBook Pro M1
7. ✅ Documentation updated with manual workflow dispatch instructions

### Should Have
1. Local MacBook build documentation (fallback reference in appendix)
2. macOS-specific troubleshooting guide

### Nice to Have (Future Optimizations)
1. Dependency caching for faster builds
2. Improved artifact naming with version interpolation
3. `tauri-apps/tauri-action` for optimized builds

### Could Have (Future)
1. Universal macOS binaries (Intel + Apple Silicon support)
2. Intel macOS builds (if needed for broader distribution)
3. Code signing with Apple Developer certificate
4. Notarization for Gatekeeper approval
5. App Store distribution
6. Automatic builds on git tag push (vs manual trigger)

## Decisions Made

✅ **Trigger**: Manual workflow dispatch only
✅ **Release Creation**: Workflow creates GitHub release with artifacts
✅ **Architecture**: Apple Silicon (ARM64) - M1 MacBook Pro
✅ **Whisper.cpp**: Already configured on Mac, testing focus is app functionality
✅ **Build Strategy**: GitHub Actions for both Windows and macOS

## Open Questions

1. **GitHub Actions Tooling**:
   - Should we use `tauri-apps/tauri-action` or manual build steps with `npm run tauri:build`?
   - Do we need dependency caching in first iteration, or add later for optimization?

2. **Microphone Permissions**:
   - Does macOS prompt for microphone access correctly out-of-the-box?
   - Do we need to add custom permission descriptions to Tauri's `Info.plist` config?
   - (Will discover during testing)

## Implementation Plan

### Phase 1: GitHub Actions Setup (This PRD)
1. **Configuration Changes**:
   - Update bundle identifier in `tauri.conf.json` to `com.thoughtcast.desktop`
   - Verify icon assets (especially `icon.icns` for macOS)

2. **GitHub Actions Implementation**:
   - Create `.github/workflows/release-cross-platform.yml`
   - Configure Windows build job (`windows-latest`)
   - Configure macOS build job (`macos-latest` for Apple Silicon)
   - Add release creation job that attaches artifacts
   - Set up version input via `workflow_dispatch`

3. **Verification**:
   - Trigger build via workflow dispatch with test version
   - Download `.dmg` from GitHub release
   - Test on MacBook Pro M1 (functional checklist)
   - Verify Windows `.exe` builds correctly

4. **Documentation**:
   - Update BUILD_GUIDE.md with manual workflow dispatch instructions
   - Update CLAUDE.md with release creation workflow notes
   - Add local macOS build guide (fallback reference in appendix)

### Phase 2: Optimizations (Future)
1. Add dependency caching (npm + Cargo) for faster builds
2. Improve artifact naming with version interpolation
3. Add build status badges to README
4. Consider `tauri-apps/tauri-action` for optimized builds

## Technical Notes

### File Path Differences
- **Windows**: `C:\Users\{User}\Documents\ThoughtCast\`
- **macOS**: `/Users/{User}/Documents/ThoughtCast/` or `~/Documents/ThoughtCast/`

Tauri's `app_data_dir()` handles this cross-platform difference automatically.

### macOS Signing Considerations (Future)
For distributable apps, Apple requires:
- **Developer ID**: $99/year Apple Developer Program
- **Notarization**: Submit app to Apple for malware scan
- **Gatekeeper**: Ensures only trusted apps run by default

For personal use (this MVP), unsigned apps can run with:
1. Right-click → Open (first launch)
2. System Settings → Privacy & Security → "Open Anyway"

### Tauri Bundle Configuration
Current `tauri.conf.json` specifies `"targets": "all"`, which will attempt to build all available formats for the current platform:
- **macOS**: `.app` bundle, `.dmg` disk image
- **Windows**: `.exe` (NSIS installer)

## References

- [Tauri Bundle Configuration Docs](https://tauri.app/v1/api/config/#bundleconfig)
- [GitHub Actions: Building Tauri Apps](https://tauri.app/v1/guides/building/github-actions)
- [Apple Developer: Notarizing macOS Apps](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Tauri Cross-Compilation Limitations](https://tauri.app/v1/guides/building/cross-platform)

## Appendix: Quick Start for MacBook Pro

```bash
# 1. Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install Node.js
brew install node

# 3. Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# 4. Install Xcode CLI tools
xcode-select --install

# 5. Clone and build
git clone <repo-url>
cd ThoughtCast
npm install
npm run tauri:build

# 6. Run the app
open src-tauri/target/release/bundle/macos/ThoughtCast.app
```

# PRD: ThoughtCast (Voice Notes Desktop App)

## Executive Summary

Build a cross-platform desktop application that captures voice recordings, transcribes them locally using Whisper.cpp, and maintains a searchable history of all recordings and transcripts.

## Problem Statement

I need a single desktop app where I can:
- Click once to start recording my voice
- Click once to stop and automatically get a transcript
- Have the transcript immediately copied to my clipboard
- Browse all my past recordings and transcripts in one place

Current solutions require multiple apps, manual file management, or cloud services. This must be one self-contained desktop app with local processing.

## Success Criteria

- **One-click recording**: Start recording with a single button click
- **Automatic transcription**: Transcription happens immediately after stopping, no manual steps
- **Zero cloud dependency**: All processing happens locally on my machine
- **Instant clipboard**: Transcript is automatically copied to clipboard after processing
- **Persistent history**: All recordings and transcripts are saved and browsable
- **Cross-platform**: Works on both Windows and macOS

## User Stories

### Primary Flow
1. As a user, I want to click "Record" to start capturing audio from my microphone
2. As a user, I want to see a timer showing how long I've been recording
3. As a user, I want to click "Stop" to end recording and automatically trigger transcription
4. As a user, I want the transcript automatically copied to my clipboard without any action
5. As a user, I want to see my new transcript immediately in the app
6. As a user, I want to browse all my past recordings in a sidebar

### Secondary Flow
7. As a user, I want to import an existing audio file if I recorded it elsewhere
8. As a user, I want to click any past session to view its full transcript
9. As a user, I want to copy any past transcript to my clipboard

## Functional Requirements

### Recording
- **F1**: Built-in microphone recording capability
- **F2**: Visual timer showing recording duration
- **F3**: Clear visual state showing when recording is active

### Transcription
- **F4**: Automatic transcription using local Whisper.cpp installation
- **F5**: Support for GPU acceleration when available
- **F6**: Automatic cleanup of timestamp markers from transcripts

### Data Management
- **F7**: Persistent storage of all audio files and transcripts
- **F8**: Organized file structure with timestamp-based naming
- **F9**: Session index maintaining metadata for all recordings

### User Interface
- **F10**: Sidebar showing all past sessions with preview text
- **F11**: Main panel showing selected session details and full transcript
- **F12**: Status messages for user feedback during operations

## Non-Functional Requirements

### Performance
- **P1**: Transcription should utilize available GPU/accelerator hardware
- **P2**: App should remain responsive during transcription
- **P3**: Session list should load quickly even with hundreds of entries

### Usability
- **U1**: Maximum 2 clicks to go from idle to recording to transcribed
- **U2**: Clear visual feedback for all operations
- **U3**: Minimal configuration required for first use

### Compatibility
- **C1**: Windows 10/11 support
- **C2**: macOS 12+ support
- **C3**: Works with standard Whisper.cpp builds
- **C4**: Works with ffmpeg installed via standard package managers

## User Interface Specification

### Layout
```
+------------------+--------------------------------+
| Sessions Sidebar | Main Panel                     |
|                  |                                |
| [Recent First]   | [Record/Stop Button]           |
| ┌──────────────┐ | Status: Ready                  |
| │Oct 30 16:42  │ |                                |
| │First few...  │ | Session Details:               |
| └──────────────┘ | ┌────────────────────────────┐ |
| ┌──────────────┐ | │                            │ |
| │Oct 30 14:23  │ | │   Full Transcript Text     │ |
| │Another rec...│ | │                            │ |
| └──────────────┘ | │                            │ |
|                  | └────────────────────────────┘ |
|                  | [Copy to Clipboard]            |
+------------------+--------------------------------+
```

### Components

**Sessions Sidebar**
- List of all recordings, newest first
- Each item shows: timestamp and first ~50 characters of transcript
- Clicking selects that session

**Main Panel - Controls**
- Primary action button: "● Record" when idle, "■ Stop" when recording
- Live timer display during recording (format: MM:SS)
- Status text for feedback
- Optional: "Import Audio File" button (smaller, secondary)

**Main Panel - Session View**
- Metadata: creation time, file paths, duration
- "Copy to Clipboard" button
- Full transcript in scrollable text area

## Data Model

### Session Object
- Unique ID (timestamp-based)
- Creation timestamp
- Duration in seconds
- Audio file path
- Transcript file path
- Preview text (first ~100 characters)

### Storage Structure
```
VoiceNotes/
├── config.json         # App configuration
├── index.json          # Session registry
├── audio/              # Original recordings
│   └── 2025-10-30_16-42-11.wav
└── text/               # Transcripts
    └── 2025-10-30_16-42-11.txt
```

## Configuration

The app requires a `config.json` file specifying:
- Path to Whisper.cpp executable
- Path to Whisper model file
- Output directory for recordings and transcripts

## Technical Constraints

### Prerequisites
- Whisper.cpp must be compiled and available locally
- ffmpeg must be installed and accessible via PATH
- Appropriate Whisper model file must be downloaded

### Audio Requirements
- Target format: 16kHz mono WAV for Whisper compatibility
- Automatic conversion if recorded at different rates

## Acceptance Criteria

### MVP Must Have
- [ ] Click Record button → microphone starts recording
- [ ] Click Stop button → recording stops, transcription starts
- [ ] Transcript appears in UI within reasonable time
- [ ] Transcript is automatically in clipboard
- [ ] All sessions persist between app restarts
- [ ] Can click old sessions to view their transcripts
- [ ] Works on Windows
- [ ] Works on macOS

### Nice to Have (Post-MVP)
- [ ] Import external audio files
- [ ] Edit configuration through UI
- [ ] Delete sessions
- [ ] Search transcripts
- [ ] Export sessions
- [ ] Audio playback

## Out of Scope

The following features are explicitly NOT required for MVP:
- Cloud sync or backup
- Multi-user support
- Audio editing capabilities
- Transcript editing
- AI summarization or formatting
- Mobile app
- Web version
- Automatic Whisper/ffmpeg installation
- Real-time transcription during recording

## Definition of Done

The app is considered complete when:
1. A user can record, stop, and see their transcript in under 3 clicks
2. The transcript is automatically in their clipboard
3. They can close the app, reopen it, and see all their past recordings
4. It works reliably on both Windows and macOS
5. No external apps or manual file management required

---

## Handoff Notes for Implementation

This PRD should be implemented as a Tauri desktop application with:
- Rust backend for audio capture, file management, and Whisper integration
- React frontend for the user interface
- Cross-platform audio capture (suggest `cpal` crate)
- Local storage using JSON for the index and filesystem for media

The implementation should prioritize the recording flow over the import flow. Getting microphone → transcript → clipboard working smoothly is the core value proposition.
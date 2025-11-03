# PRD: Pause and Cancel Recording Controls

## Overview

Add pause and cancel controls to the voice recording interface, allowing users to temporarily suspend recording to check references or abort unwanted recordings.

## Problem Statement

Users currently cannot:
- Pause a recording to check code, data, or research without losing their session
- Abandon a recording they've started but no longer need
- Control the recording flow beyond a simple start/stop pattern

This forces users to either include unwanted audio or lose their entire recording when they need to look something up mid-thought.

## User Stories

### Pause Functionality
**As a user**, I want to pause my recording while I check reference materials, so that I can continue my thought without unwanted silence or noise in the transcript.

**Acceptance Criteria:**
- Pause button appears when recording is active
- Clicking pause stops audio capture but preserves existing recording
- Timer shows pause state (stopped or dimmed)
- Audio captured before pause is retained
- User can resume recording from paused state

### Cancel Functionality
**As a user**, I want to cancel a recording I've started, so that I don't create unwanted sessions when I realize I don't need the recording.

**Acceptance Criteria:**
- Cancel button appears when recording is active or paused
- Clicking cancel discards the entire recording session
- No audio file is saved to disk
- No session entry is created in sessions list
- UI returns to idle state (ready to start new recording)

### Resume Functionality
**As a user**, I want to resume a paused recording, so that I can continue capturing my thoughts after checking references.

**Acceptance Criteria:**
- Resume button appears when recording is paused (replaces pause button)
- Clicking resume continues audio capture
- Timer resumes counting from where it paused
- Audio before and after pause is combined into single recording

## User Interface

### Recording State: Active
**Visible Controls:**
- **Pause button** - visually distinct color (e.g., yellow/amber)
- **Cancel button** - visually distinct color (e.g., red outline or destructive styling)
- **Stop button** - primary action color (e.g., red solid)
- **Timer** - actively counting up, showing elapsed recording time

### Recording State: Paused
**Visible Controls:**
- **Resume button** - replaces pause button, visually indicates continuation (e.g., green)
- **Cancel button** - same styling as during active recording
- **Stop button** - same styling as during active recording
- **Timer** - shows total elapsed time, visually indicates paused state (dimmed, "PAUSED" label, or stopped animation)

### Recording State: Idle (No Recording)
**Visible Controls:**
- **Record/Start button** - initiates new recording
- **Timer** - shows 00:00:00 or hidden

## Behavior & Edge Cases

### Pause Behavior
- **Audio Handling**: Pausing stops audio capture immediately. When resumed, audio continues from that point.
- **Multiple Pauses**: Users can pause and resume multiple times within a single recording session.
- **Timer Display**: Timer should clearly indicate paused state (stopped counting, visual indicator, or "PAUSED" label).
- **Long Pauses**: No time limit on pause duration. Recording remains paused until user resumes or cancels.

### Cancel Behavior
- **Data Cleanup**: Cancelled recordings should not leave artifacts (no WAV files, no session entries).
- **Confirmation**: Consider whether cancel requires confirmation (e.g., "Are you sure?") or is immediate. **Recommendation**: Immediate cancel without confirmation for faster workflow, but button should be visually distinct/positioned to avoid accidental clicks.
- **Cancel from Pause**: User can cancel while paused - same behavior as cancelling during active recording.

### Stop Behavior (Existing, but now with context)
- **Finalize Recording**: Stop completes the recording, triggers transcription, and creates session entry.
- **Available States**: Can stop from active recording or from paused state.
- **Paused Recordings**: Stopping a paused recording should process the audio captured up to the pause point.

### State Transitions
```
Idle → [Record] → Recording
Recording → [Pause] → Paused
Recording → [Stop] → Processing → Idle (session created)
Recording → [Cancel] → Idle (no session)
Paused → [Resume] → Recording
Paused → [Stop] → Processing → Idle (session created)
Paused → [Cancel] → Idle (no session)
```

### Visual Feedback
- **Button Colors**: Use color to communicate action intent
  - Pause: Yellow/amber (caution, temporary suspension)
  - Cancel: Red outline or secondary destructive (discard action)
  - Stop: Red solid (finalize action)
  - Resume: Green (continue action)
- **Recording Indicator**: Active recording should have visual pulse/animation
- **Paused Indicator**: Paused state should be clearly distinct from active (dimmed timer, "PAUSED" label)

## Out of Scope

- Audio editing or trimming of paused segments
- Playback of recording before stopping
- Saving paused recordings for later continuation (pause persists across app restarts)
- Undo for cancelled recordings
- Pause keyboard shortcuts or hotkeys (future enhancement)

## Success Metrics

- Users can successfully pause, resume, and complete recordings
- Users can cancel unwanted recordings without creating session artifacts
- No confusion between pause, cancel, and stop actions (clear visual distinction)
- Audio quality is maintained across pause/resume boundaries

## Future Considerations

- Keyboard shortcuts for pause (Space bar) and cancel (Esc)
- Visual waveform showing pause gaps
- Ability to trim or edit pause gaps after recording
- Audio markers indicating pause points in transcript

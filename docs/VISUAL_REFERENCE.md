# ThoughtCast - Visual Reference

This document describes what the app looks like when running.

## App Window

**Window Size:** 1200px × 800px
**Title:** ThoughtCast

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ ThoughtCast                                                   ⚊ ⚉ ⚇ │
├──────────────┬──────────────────────────────────────────────────┤
│   Sessions   │  ThoughtCast                                     │
├──────────────┼──────────────────────────────────────────────────┤
│              │                                                   │
│ Oct 30 4:42  │  [●●● Record]                                    │
│ This is...   │                                                   │
│ (Selected)   │  Status: Not implemented yet                     │
│              │                                                   │
│ Oct 30 2:23  │  ─────────────────────────────────────────────   │
│ This is...   │                                                   │
│              │  Selected Session                                │
│ Oct 30 11:15 │                                                   │
│ This is...   │  ID: 2024-10-30-16-42                            │
│              │  Time: Oct 30, 2024 4:42 PM                      │
│ Oct 29 6:30  │                                                   │
│ Yesterday's  │  Transcript Preview                              │
│              │  ┌────────────────────────────────────────────┐  │
│ Oct 29 9:45  │  │ This is mock session 1 - testing the     │  │
│ Morning st.. │  │ recording interface                       │  │
│              │  └────────────────────────────────────────────┘  │
│              │                                                   │
│              │  ⚠ (Recording functionality coming in next       │
│              │     phase)                                        │
│              │                                                   │
└──────────────┴──────────────────────────────────────────────────┘
```

## Component Breakdown

### Sidebar (Left Panel - 300px wide)

**Header:**
- Background: Light gray (#e8e8e8)
- Text: "Sessions"
- Font: 18px, semi-bold

**Session Items:**
- Each item shows:
  - Timestamp (gray, 12px)
  - Preview text (truncated, 14px)
- Hover: Slightly darker background
- Selected: Blue background (#d0e8ff) with blue left border

### Main Panel (Right Panel - Remaining width)

**Header:**
- Background: Very light gray (#f9f9f9)
- Text: "ThoughtCast" (24px, bold)

**Controls Section:**
- "● Record" button (blue, but disabled/grayed out)
- Status text below: "Status: Not implemented yet" (italic)

**Session Details Area:**
- Shows selected session info:
  - Section title: "Selected Session"
  - Session metadata in light gray box
  - Transcript preview in bordered box
- Yellow warning banner about future implementation

**When No Session Selected:**
- Centered text explaining to select a session
- Gray, centered layout

## Color Scheme

| Element | Color | Hex |
|---------|-------|-----|
| Sidebar background | Light gray | #f5f5f5 |
| Sidebar header | Darker gray | #e8e8e8 |
| Selected session | Light blue | #d0e8ff |
| Selected border | Blue | #0066cc |
| Main background | White | #ffffff |
| Main header bg | Very light gray | #f9f9f9 |
| Controls bg | Off-white | #fafafa |
| Button (primary) | Blue | #0066cc |
| Button (disabled) | Blue @ 50% | #0066cc (opacity 0.5) |
| Text (primary) | Dark gray | #333333 |
| Text (secondary) | Medium gray | #666666 |
| Border | Light gray | #e0e0e0 |
| Warning banner bg | Light yellow | #fff3cd |
| Warning banner border | Yellow | #ffc107 |
| Warning banner text | Dark yellow | #856404 |

## Interaction States

### Session Item Hover
- Background becomes slightly darker
- Cursor changes to pointer
- Smooth transition (0.2s)

### Session Item Selected
- Light blue background (#d0e8ff)
- 3px blue left border (#0066cc)
- Remains highlighted until different session clicked

### Record Button
- Currently disabled (50% opacity)
- Cursor shows "not-allowed"
- In future: Will be blue, clickable, and change to "■ Stop" when recording

## Typography

**Font Family:**
```
-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif
```

**Font Sizes:**
- Main title (ThoughtCast): 24px
- Section headers: 20px
- Subsection headers: 16px
- Regular text: 14px
- Small text (timestamps): 12px

## Responsive Behavior

- Window is resizable
- Sidebar maintains 300px width
- Main panel takes remaining space
- Minimum window size should be ~800×600 to remain usable

## Scrolling Behavior

- Sidebar session list scrolls vertically when items overflow
- Main panel content scrolls vertically when needed
- Horizontal scrolling is not expected

## Sample Mock Data Displayed

When app first opens, you should see these 5 sessions:

1. **Oct 30, 2024 4:42 PM** - "This is mock session 1 - testing the recording interface" (Selected by default)
2. **Oct 30, 2024 2:23 PM** - "This is mock session 2 - another test recording"
3. **Oct 30, 2024 11:15 AM** - "This is mock session 3 - early morning thoughts"
4. **Oct 29, 2024 6:30 PM** - "This is mock session 4 - yesterday's ideas"
5. **Oct 29, 2024 9:45 AM** - "This is mock session 5 - morning standup notes"

## Accessibility Notes

- Clickable elements have pointer cursor
- Selected state has visual indicator (blue highlight + border)
- Disabled state is visually clear (grayed out)
- Good contrast ratios for text

---

**Implementation Status:** All visual elements described above are implemented in the current skeleton. The UI is fully interactive for navigation, but recording functionality is not yet implemented.

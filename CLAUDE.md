# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ThoughtCast is a cross-platform desktop app (Tauri + React + Rust) for voice recording and local AI transcription using Whisper.cpp. All processing happens locally - no cloud dependencies.

**Core Flow**: Record voice → Stop → Auto-transcribe with Whisper → Copy to clipboard → Store session

## Development Commands

### Frontend (React + Vite)
```bash
npm run dev              # Start Vite dev server (port 3001)
npm run build            # Build frontend for production
npm run preview          # Preview production build
```

### Tauri Desktop App
```bash
npm run tauri:dev        # Run app in dev mode (hot reload)
npm run tauri:build      # Build production executable (local machine only)
npm run tauri            # Access Tauri CLI directly
```

### Release Builds (GitHub Actions)
Cross-platform releases are built via GitHub Actions workflow:

**Location**: `.github/workflows/release-cross-platform.yml`

**Trigger**: Manual workflow dispatch only (no automatic builds on push)

**How to Create a Release**:
1. Go to GitHub → Actions → Build and Release
2. Click "Run workflow"
3. Enter version tag (e.g., `v0.1.0`)
4. Workflow builds Windows `.exe` and macOS `.dmg` (Apple Silicon)
5. Creates GitHub release with both installers attached

**Output Artifacts**:
- Windows: `ThoughtCast_<version>_x64-setup.exe` (NSIS installer)
- macOS: `ThoughtCast_<version>_aarch64.dmg` (Apple Silicon/ARM64)

**Note**: macOS builds cannot be cross-compiled from Windows - use GitHub Actions for macOS releases.

### Type Checking & Testing
```bash
tsc                      # Run TypeScript compiler (no output, just validation)
npm test                 # Run unit tests with Vitest
npm run integration-precheck  # Run full pre-commit checks (type-check, tests, Rust)
```

### Debug Logging
Application uses a centralized logger (`src/shared/utils/logger.ts`) instead of direct console calls. To enable debug output:

```bash
# Create .env.local (copy from .env.local.example)
echo "VITE_DEBUG_LOGS=true" > .env.local
npm run dev  # Logs will now appear in console
```

**Important**: Always use `logger.error()`, `logger.warn()`, etc. instead of direct `console.*` calls in application code.

## Architecture

### Technology Stack
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Rust + Tauri (cross-platform desktop)
- **Audio**: cpal (audio I/O) + hound (WAV encoding)
- **Transcription**: Whisper.cpp (external process invoked via Rust)
- **Storage**: JSON files + filesystem (no database)

### Frontend Architecture (React)

**Feature-Based Organization**: Code is organized by domain/feature, NOT by technical layers (no `components/`, `hooks/`, `utils/` directories at feature level).

**React Separation Doctrine**: ZERO business logic in `.tsx` files. Components should be ultra-thin presentation layers. All calculations, transformations, and business rules belong in hooks or pure functions.

### Tauri API Integration

**CRITICAL**: All Tauri invoke calls MUST go through `wrapTauriInvoke` from `src/api/services/tauriInvokeWrapper.ts`.

**Purpose**: The wrapper provides consistent error handling by catching all Tauri API errors and wrapping them in `ApiError` with:
- Human-readable error messages
- Structured error codes for client-side handling
- Original error preservation for debugging

**Implementation Pattern**:
```typescript
// CORRECT - use wrapper
import { wrapTauriInvoke } from './tauriInvokeWrapper';

async getSessions(): Promise<SessionIndex> {
  return wrapTauriInvoke<SessionIndex>(
    'get_sessions',
    undefined,
    'Failed to load sessions',
    'SESSION_LOAD_FAILED'
  );
}

// INCORRECT - direct Tauri API call
import { invoke } from '@tauri-apps/api/core';
async getSessions() {
  return await invoke<SessionIndex>('get_sessions');  // ❌ No error wrapping
}
```

**Testing Strategy**:
- **Service tests** (`*Service.test.ts`): Mock `@tauri-apps/api/core` directly, keep wrapper real to test error handling
- **Hook/feature tests**: Provide mock service implementations via `ApiProvider`, use Tauri API mock as safety net
- **Never mock the wrapper** in service tests - its error handling logic must be tested

**Example Service Test**:
```typescript
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

it('should wrap errors in ApiError', async () => {
  mockInvoke.mockRejectedValue(new Error('Backend failed'));

  await expect(service.getSessions()).rejects.toThrow(ApiError);
  await expect(service.getSessions()).rejects.toThrow('Failed to load sessions');
});
```

### Backend Architecture (Rust)

The Rust backend is organized as a single `recording` module with clear sub-modules

**Key Backend Patterns**:
- **Public API Surface** (`lib.rs`): Tauri commands delegate to `recording` module
- **Shared State**: `RecordingState` wrapped in `Arc<Mutex<>>` for thread-safe recording
- **Domain-Driven**: All recording logic is under `recording/` namespace
- **Clear Boundaries**: Audio, transcription, session, and config are separate sub-modules

### Data Flow

1. **Start Recording**: Frontend → `start_recording` command → Rust spawns audio capture thread → Samples stored in `Arc<Mutex<Vec<f32>>>`
2. **Stop Recording**: Frontend → `stop_recording` command → Rust stops capture → Saves WAV → Invokes Whisper.cpp → Cleans transcript → Copies to clipboard → Returns `Session` to frontend
3. **Session Storage**: `sessions.json` index file + `audio/` and `text/` directories in `Documents/ThoughtCast/`

### Storage Structure

User data directory: `~/Documents/ThoughtCast/` (Windows/macOS)

```
Documents/ThoughtCast/
├── config.json              # User-created Whisper config
├── sessions.json            # Session index
├── audio/                   # Recorded WAV files
│   └── 2024-11-02_15-30-00.wav
└── text/                    # Transcript files
    └── 2024-11-02_15-30-00.txt
```

## Configuration

### Initial Setup (Required)

Users must manually create `config.json` in `~/Documents/ThoughtCast/`:

```json
{
  "whisperPath": "/path/to/whisper.cpp/build/bin/whisper-cli",
  "modelPath": "/path/to/whisper.cpp/models/ggml-large-v3-turbo.bin"
}
```

**Prerequisites**:
- Whisper.cpp compiled locally ([build guide](https://github.com/ggerganov/whisper.cpp))
- Whisper model downloaded (e.g., `ggml-base.bin` or `ggml-large-v3-turbo.bin`)
- Platform-specific build tools (see [docs/BUILD_GUIDE.md](docs/BUILD_GUIDE.md))

## Claude Code Development Workflow

### Core Principles

**Architectural Stewardship**: Every change is an opportunity to improve the system's structure, not just solve the immediate problem. Fight entropy - each change should make the codebase more organized, maintainable, and extensible.

When implementing changes, clearly articulate:
1. What you discovered about the current system
2. Why you chose your specific approach
3. How your changes improve long-term maintainability
4. What future extensions your changes enable or simplify

### Mandatory Red-Green-Refactor Process

**CRITICAL**: EVERY change (regardless of size or complexity) MUST follow this complete process. No exceptions for "simple" requests, one-line changes, or quick fixes.

#### Phase 1: Requirement Analysis (Red)

**Deep System Analysis**:
- Examine the specific area where the task targets
- Expand investigation to understand related components, dependencies, call sites
- Map data flow and control flow through relevant parts
- Identify all stakeholders and components that could be affected
- Understand existing patterns, conventions, and architectural decisions
- Look for similar implementations to maintain consistency

**Impact Assessment**:
- Analyze full scope of changes required across codebase
- Identify potential breaking changes and ripple effects
- Consider performance implications and scalability
- Evaluate how changes affect testing, debugging, and future maintenance
- Assess whether existing abstractions are sufficient

**Strategic Implementation Planning**:
- Design solutions that solve the problem AND improve extensibility
- Choose approaches that reduce complexity
- Plan changes that make future similar tasks easier
- Maintain or improve separation of concerns
- Leave the codebase in a better state

#### Phase 2: Implementation (Green)

Implement the minimal solution that satisfies requirements:

- **MANDATORY**: Apply React separation doctrine - ZERO logic in `.tsx` files
- **MANDATORY**: Generate unit tests for ALL new logic (`.ts`) and hook orchestration (`use*.ts`)
- **MANDATORY**: Extract logic from components into hooks or pure functions, even for "simple" changes
- Focus on making it work first
- Follow existing patterns and conventions
- Use TodoWrite to track implementation steps
- Maintain test coverage

**Boy-Scout Rule** (for non-bug fixes):
- When touching any file, extract at least one logic chunk with tests
- Move related hook + logic + types together with components
- Create subdirectories when 3+ related files exist
- Update imports in the same PR
- DON'T reorganize unrelated files

**Bug Fix Rules** (LIMITED SCOPE):
- **SUSPEND** Boy-Scout Rule - only change code directly related to fix
- Changes should be minimal and focused on specific issue
- NO unrelated improvements, file reorganization, or pattern updates
- Extract bug fix logic into separate function/hook if it helps clarity

#### Phase 3: Architecture Review & Refactor (Refactor)

**MANDATORY** after every implementation - analyze for:

**Duplication Detection**:
- 2nd occurrence → note the pattern
- 3rd occurrence → MUST refactor to abstraction
- Look for similar logic, components, or data structures

**Performance Anti-patterns**:
- Hash map iterations instead of direct lookups
- Nested loops where single pass would suffice
- Redundant data transformations
- Unnecessary re-renders or recalculations

**Data Structure Issues**:
- Multiple representations of same data
- Complex lookup patterns that defeat data structure benefits
- Missing normalization opportunities

**React Separation Violations**:
- Business logic mixed with presentation in `.tsx` files
- Components over 200 lines without extraction
- Missing abstraction layers (hooks, pure functions)
- Logic directly in event handlers instead of hook callbacks
- Pure functions importing React or testing libraries
- Cross-feature imports bypassing public APIs

### Mandatory Orchestration Protocol

**Main Agent Role**: Acts as orchestrator for all review agents. Specialized agents do NOT call other agents - they complete their work and return control to Main Agent.

#### Orchestration Flow

**Step 1: Implementation**
- Main Agent implements requested changes
- Applies all implementation standards (React separation, testing, etc.)
- Prepares context for review agents

**Step 2: Frontend Design Review** (for non-bug-fix changes)
- Main Agent invokes Frontend Design Review Agent
- Agent completes and returns design improvements
- Main Agent receives results

**Step 3: E2E Test Review** (conditional)
- Main Agent checks git diff for E2E file changes:
  ```bash
  git diff --name-only | grep -E 'e2e/.*\.(test|spec)\.ts$|e2e/page-objects/.*\.ts$'
  ```
- **IF** E2E files modified: Main Agent invokes E2E Test Architect Agent
- Agent completes and returns E2E test improvements

**Step 4: Architecture Review** (always)
- Main Agent invokes Architecture Review Agent (with bug fix context if applicable)
- Agent completes and returns architectural improvements

**Step 5: Code Organization & Naming Review** (always)
- Main Agent invokes Code Organization & Naming Agent (with bug fix context if applicable)
- Agent completes and returns organization improvements

**Step 6: Final Summary**
- Main Agent provides comprehensive summary to user
- Includes improvements from all invoked agents

#### Size-Agnostic Enforcement Rules

**EVERY CHANGE MUST**:
- Follow complete 3-agent process - no shortcuts
- Complete each stage fully - no skipping or combining agents
- Generate proper handoff summaries for next agent
- Apply all quality standards at every stage

**FORBIDDEN SHORTCUTS**:
- ❌ "This is simple, skip architecture review"
- ❌ "No visual changes, skip design review"
- ❌ "Quick fix doesn't need full workflow"
- ❌ "Urgent request, streamline process"

**NO EXCEPTIONS**: Size, complexity, and urgency do NOT justify skipping steps.

### Bug Fix Detection

Determine if change is a bug fix by examining:
- User request contains: "fix", "bug", "issue", "error", "broken", "not working"
- Branch name contains: "fix", "bug", "issue", "hotfix"
- Change addresses unintended behavior or incorrect functionality
- Change corrects a defect rather than adding new capability

**Bug Fix vs Feature**:
- **Bug Fix**: Corrects unintended behavior, restores expected functionality
- **Feature**: Adds new capability, enhances existing functionality
- **When Unclear**: Ask user to clarify

## Code Quality Agents

This project uses automated agents (`.claude/agents/`) enforced through the orchestration protocol:

### Architecture Review Agent
- **Triggered**: After every implementation (Step 4 of orchestration)
- **Enforces**:
  - File size limits (300 lines max)
  - React separation (no business logic in `.tsx`)
  - Code duplication (Rule of Three: extract on 3rd occurrence)
  - Feature-based organization (no type-based directories)
- **Bug Fix Protocol**: LIMITED SCOPE - only review code directly touched by fix

### Code Organization & Naming Agent
- **Triggered**: After architecture review (Step 5 - final quality gate)
- **Enforces**:
  - 10-file threshold (directories with 10+ files must have sub-grouping)
  - 3-file rule (3+ related files should be in subdirectory)
  - Intent-revealing names (no generic `utils.ts`, `helpers.ts`)
  - Layer peeling coherence (directory → file → function naming alignment)
- **Zero tolerance** for type-based organization (`components/`, `hooks/`, `types/` at feature level)
- **Exception**: `src/shared/components/` for generic UI primitives ONLY

### Frontend Design Reviewer
- **Triggered**: After implementation, before architecture review (Step 2)
- **Implements** visual design improvements directly (not just recommendations)
- **Focuses on**: Visual consistency, proportional design, CSS polish

### E2E Test Architect
- **Triggered**: When E2E test files are modified (Step 3 - conditional)
- **Enforces**: Page Object Model pattern and testing best practices
- **Builds**: Maintainable E2E test infrastructure

## Commit Message Style

Based on recent commits, use **conventional commit prefixes**:

```
IMPROVE: [Feature enhancement description] (#PR)
REFACTOR: [Refactoring description] (#PR)
BUG: [Bug fix description]
Add [New feature description] (#PR)
```

Example:
```
IMPROVE: Implement design system with L1 base components and design tokens (#14)
BUG: Fix Windows console popup and add processing state feedback
```

## Important Constraints

### Audio Format
- Recordings are captured as 16kHz mono WAV for Whisper compatibility
- Sample rate conversion happens during WAV encoding

### Whisper Integration
- Whisper.cpp runs as external subprocess (not embedded)
- Transcript cleaning removes timestamp markers: `[00:00:00.000 --> 00:00:05.000]`
- Transcription errors are graceful - recording still saved

### Cross-Platform Considerations
- Windows: Paths use backslashes, config in `C:\Users\{User}\Documents\ThoughtCast\`
- macOS: Paths use forward slashes, config in `~/Documents/ThoughtCast/`
- Tauri handles platform-specific window management and file system access

## Known Limitations

- No test framework configured (should be added)
- No audio playback (view transcripts only)
- No search/filter in session list yet
- No session deletion UI (manual file deletion required)
- Whisper.cpp and model must be manually installed (not bundled)

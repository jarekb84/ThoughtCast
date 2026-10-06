/**
 * Tauri event emitted by the audio capture thread when the stream fails
 * mid-recording or fails to initialize.
 *
 * Lives in `src/api/` (not `src/features/recording/`) because the workflow
 * hook in `src/app/` subscribes to it. Mirrors the layout of
 * `TranscriptionEvents.ts` and `CompressionEvents.ts`.
 *
 * The string literal matches the event name emitted from
 * `src-tauri/src/lib.rs::start_recording`.
 */
import { Session } from "./Session";

export const RECORDING_CAPTURE_FAILED = "recording-capture-failed" as const;

/**
 * Payload mirrors Rust's `RecordingCaptureFailedEvent` in
 * `src-tauri/src/recording/audio/failure.rs`.
 *
 * `recovered_session` is `null` when the failure happened before any audio
 * could be captured (or the partial save itself failed) — the UI should still
 * surface the warning so the user knows recording is no longer active.
 */
export interface RecordingCaptureFailedPayload {
  reason: string;
  partial_duration_seconds: number;
  recovered_session: Session | null;
}

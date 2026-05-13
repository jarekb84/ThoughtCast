/**
 * Tauri events emitted by the compression pipeline / batch worker.
 *
 * Lives in `src/api/` (not `src/features/compression/`) because these constants
 * cross feature boundaries: both `useCompressionBatch` (in features/compression)
 * and `useRecordingWorkflow` (in app/) subscribe to them. Mirrors the layout
 * of `TranscriptionEvents.ts`.
 *
 * The string literals match the strings emitted from `src-tauri/src/lib.rs`.
 * Keep this file as the single source of truth on the frontend so a typo
 * can't drift.
 */

export const SESSION_AUDIO_COMPRESSED = "session-audio-compressed" as const;
export const COMPRESSION_BATCH_PROGRESS = "compression-batch-progress" as const;
export const COMPRESSION_BATCH_COMPLETE = "compression-batch-complete" as const;

export interface SessionAudioCompressedPayload {
  session_id: string;
  new_audio_path: string;
  bytes_freed: number;
}

export interface CompressionBatchProgressPayload {
  total: number;
  currentIndex: number;
  currentFile: string | null;
  bytesFreed: number;
}

export interface CompressionBatchCompletePayload {
  total: number;
  compressed: number;
  skipped: number;
  bytesFreed: number;
  cancelled: boolean;
}

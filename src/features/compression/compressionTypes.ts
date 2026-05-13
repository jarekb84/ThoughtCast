/**
 * Frontend mirror types for the batch compression subsystem. Matches the
 * shapes serialized by `src-tauri/src/recording/compression/`.
 */

export type BatchStatus = "idle" | "running" | "cancelling";

export interface BatchProgress {
  status: BatchStatus;
  total: number;
  currentIndex: number;
  currentFile: string | null;
  bytesFreed: number;
  skipped: number;
  compressed: number;
}

export interface StorageStats {
  wavCount: number;
  wavBytes: number;
  m4aCount: number;
  m4aBytes: number;
  estimatedSavingsBytes: number;
}

export const IDLE_BATCH_PROGRESS: BatchProgress = {
  status: "idle",
  total: 0,
  currentIndex: 0,
  currentFile: null,
  bytesFreed: 0,
  skipped: 0,
  compressed: 0,
};

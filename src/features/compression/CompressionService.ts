import { wrapTauriInvoke } from "../../api/services/tauriInvokeWrapper";
import {
  BatchProgress,
  IDLE_BATCH_PROGRESS,
  StorageStats,
} from "./compressionTypes";

interface BackendBatchProgress {
  status: BatchProgress["status"];
  total: number;
  currentIndex: number;
  currentFile: string | null;
  bytesFreed: number;
  skipped: number;
  compressed: number;
}

/** Options for kicking off a manual batch run. */
export interface StartBatchOptions {
  /**
   * Bypass the configured `compressOldRecordingsOlderThanDays` threshold and
   * treat every uncompressed WAV as eligible. Used by the "Compress all WAV
   * files" button. When omitted, the worker reads the threshold from config —
   * which is how the automatic startup sweep operates.
   */
  ignoreThreshold?: boolean;
}

export interface ICompressionService {
  /** Trigger the batch compression worker. Errors if a run is already in flight. */
  startBatch(options?: StartBatchOptions): Promise<void>;
  /** Ask an in-flight batch to stop after the current file. */
  cancelBatch(): Promise<void>;
  /** Read the current batch progress snapshot. Used as a fallback if event listeners attach late. */
  getProgress(): Promise<BatchProgress>;
  /** Snapshot of how much disk space recordings occupy. */
  getStorageStats(): Promise<StorageStats>;
}

export class TauriCompressionService implements ICompressionService {
  async startBatch(options?: StartBatchOptions): Promise<void> {
    // `ignoreThreshold` maps to `thresholdDaysOverride=0` on the backend —
    // anything aged > 0 days (i.e., everything) becomes eligible.
    const thresholdDaysOverride = options?.ignoreThreshold ? 0 : null;
    return wrapTauriInvoke<void>(
      "start_compression_batch",
      { thresholdDaysOverride },
      "Failed to start compression batch",
      "COMPRESSION_BATCH_START_FAILED"
    );
  }

  async cancelBatch(): Promise<void> {
    return wrapTauriInvoke<void>(
      "cancel_compression_batch",
      undefined,
      "Failed to cancel compression batch",
      "COMPRESSION_BATCH_CANCEL_FAILED"
    );
  }

  async getProgress(): Promise<BatchProgress> {
    const raw = await wrapTauriInvoke<BackendBatchProgress>(
      "get_compression_progress",
      undefined,
      "Failed to read compression progress",
      "COMPRESSION_PROGRESS_FAILED"
    );
    return raw;
  }

  async getStorageStats(): Promise<StorageStats> {
    return wrapTauriInvoke<StorageStats>(
      "get_storage_stats",
      undefined,
      "Failed to read storage stats",
      "STORAGE_STATS_FAILED"
    );
  }
}

/**
 * Mock for tests — keeps a tiny in-memory state machine so progress events
 * can be simulated without spawning real workers.
 */
export class MockCompressionService implements ICompressionService {
  private progress: BatchProgress = { ...IDLE_BATCH_PROGRESS };
  private storage: StorageStats = {
    wavCount: 12,
    wavBytes: 200 * 1024 * 1024,
    m4aCount: 0,
    m4aBytes: 0,
    estimatedSavingsBytes: 180 * 1024 * 1024,
  };

  async startBatch(_options?: StartBatchOptions): Promise<void> {
    this.progress = {
      ...IDLE_BATCH_PROGRESS,
      status: "running",
      total: this.storage.wavCount,
    };
  }
  async cancelBatch(): Promise<void> {
    this.progress = { ...this.progress, status: "cancelling" };
  }
  async getProgress(): Promise<BatchProgress> {
    return { ...this.progress };
  }
  async getStorageStats(): Promise<StorageStats> {
    return { ...this.storage };
  }
  __setStorage(stats: StorageStats) {
    this.storage = { ...stats };
  }
  __setProgress(progress: BatchProgress) {
    this.progress = { ...progress };
  }
}

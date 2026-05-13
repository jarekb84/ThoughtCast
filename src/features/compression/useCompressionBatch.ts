import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  BatchProgress,
  IDLE_BATCH_PROGRESS,
  StorageStats,
} from "./compressionTypes";
import {
  COMPRESSION_BATCH_COMPLETE,
  COMPRESSION_BATCH_PROGRESS,
  CompressionBatchCompletePayload,
  CompressionBatchProgressPayload,
  useApi,
} from "../../api";
import { resolveCompressNowDisabledReason } from "./compressNowDisabledReason";
import { logger } from "../../shared/utils/logger";

export interface BatchCompletionSummary {
  total: number;
  compressed: number;
  skipped: number;
  bytesFreed: number;
  cancelled: boolean;
}

export interface CompressionBatchHandle {
  progress: BatchProgress;
  storage: StorageStats | null;
  lastCompletion: BatchCompletionSummary | null;
  isStarting: boolean;
  isRunning: boolean;
  errorMessage: string | null;
  start: (options?: { ignoreThreshold?: boolean }) => Promise<void>;
  cancel: () => Promise<void>;
  refreshStorage: () => Promise<void>;
  dismissCompletion: () => void;
  /**
   * Returns a user-facing reason the "Compress now" action is unavailable, or
   * `undefined` when the action is enabled. Centralises the precedence rules
   * (missing prerequisite → already-running → still-spinning-up) so they live
   * in one place instead of being inlined in a component.
   */
  getCompressNowDisabledReason: (
    ffmpegConfigured: boolean
  ) => string | undefined;
}

/**
 * React hook that wires the compression service to a small state machine.
 *
 * Owns:
 * - subscriptions to the `compression-batch-progress` / `-complete` events
 * - the user-facing progress + storage snapshot
 * - the "last completion summary" used to show the completion toast
 */
export function useCompressionBatch(): CompressionBatchHandle {
  const { compressionService } = useApi();
  const [progress, setProgress] = useState<BatchProgress>(IDLE_BATCH_PROGRESS);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [lastCompletion, setLastCompletion] =
    useState<BatchCompletionSummary | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pull the initial snapshot once on mount so the panel renders accurate
  // numbers immediately rather than after the first event.
  useEffect(() => {
    void compressionService
      .getProgress()
      .then(setProgress)
      .catch((e) => logger.error("getProgress failed", e));
    void compressionService
      .getStorageStats()
      .then(setStorage)
      .catch((e) => logger.error("getStorageStats failed", e));
  }, [compressionService]);

  // Live event subscriptions
  useEffect(() => {
    const unlistenPromises: Promise<() => void>[] = [];

    unlistenPromises.push(
      listen<CompressionBatchProgressPayload>(
        COMPRESSION_BATCH_PROGRESS,
        (event) => {
          setProgress((prev) => ({
            ...prev,
            status: "running",
            total: event.payload.total,
            currentIndex: event.payload.currentIndex,
            currentFile: event.payload.currentFile,
            bytesFreed: event.payload.bytesFreed,
          }));
        }
      )
    );

    unlistenPromises.push(
      listen<CompressionBatchCompletePayload>(
        COMPRESSION_BATCH_COMPLETE,
        (event) => {
          setProgress({ ...IDLE_BATCH_PROGRESS });
          // Only surface a completion toast when the run actually did
          // something — otherwise startup sweeps that find nothing eligible
          // would noisily report "successfully did nothing." A cancellation
          // is still worth confirming because the user explicitly asked for it.
          if (event.payload.compressed > 0 || event.payload.cancelled) {
            setLastCompletion({
              total: event.payload.total,
              compressed: event.payload.compressed,
              skipped: event.payload.skipped,
              bytesFreed: event.payload.bytesFreed,
              cancelled: event.payload.cancelled,
            });
          }
          // Storage stats will have changed; refresh.
          void compressionService
            .getStorageStats()
            .then(setStorage)
            .catch((e) => logger.error("getStorageStats failed", e));
        }
      )
    );

    return () => {
      unlistenPromises.forEach((p) =>
        p.then((unlisten) => unlisten()).catch(() => undefined)
      );
    };
  }, [compressionService]);

  const start = useCallback(
    async (options?: { ignoreThreshold?: boolean }) => {
      setErrorMessage(null);
      setLastCompletion(null);
      setIsStarting(true);
      try {
        await compressionService.startBatch(options);
        const fresh = await compressionService.getProgress();
        setProgress(fresh);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Failed to start compression";
        setErrorMessage(msg);
        logger.error("startBatch failed", error);
      } finally {
        setIsStarting(false);
      }
    },
    [compressionService]
  );

  const cancel = useCallback(async () => {
    try {
      await compressionService.cancelBatch();
    } catch (error) {
      logger.error("cancelBatch failed", error);
    }
  }, [compressionService]);

  const refreshStorage = useCallback(async () => {
    try {
      const stats = await compressionService.getStorageStats();
      setStorage(stats);
    } catch (error) {
      logger.error("refreshStorage failed", error);
    }
  }, [compressionService]);

  const dismissCompletion = useCallback(() => setLastCompletion(null), []);

  const isRunning = progress.status !== "idle";

  const getCompressNowDisabledReason = useCallback(
    (ffmpegConfigured: boolean) =>
      resolveCompressNowDisabledReason({
        ffmpegConfigured,
        isRunning,
        isStarting,
      }),
    [isRunning, isStarting]
  );

  return {
    progress,
    storage,
    lastCompletion,
    isStarting,
    isRunning,
    errorMessage,
    start,
    cancel,
    refreshStorage,
    dismissCompletion,
    getCompressNowDisabledReason,
  };
}

import { Button, ProgressBar } from "../../shared/components";
import { BatchProgress } from "./compressionTypes";
import { formatBytes } from "./formatBytes";
import "./CompressionProgressDialog.css";

interface CompressionProgressDialogProps {
  progress: BatchProgress;
  onRunInBackground: () => void;
  onCancel: () => void;
}

/**
 * Modal-ish overlay shown while a batch run is in flight. The "Run in
 * background" button hides the overlay without stopping the worker — the
 * batch keeps running and the user gets the completion toast when it lands.
 */
export default function CompressionProgressDialog({
  progress,
  onRunInBackground,
  onCancel,
}: CompressionProgressDialogProps) {
  if (progress.status === "idle") return null;

  const percent =
    progress.total === 0
      ? 0
      : Math.min(100, Math.round((progress.currentIndex / progress.total) * 100));

  return (
    <div className="compression-progress-overlay" role="dialog" aria-modal="true">
      <div className="compression-progress-panel">
        <h3 className="compression-progress-title">
          Compressing Audio Files
        </h3>

        <ProgressBar percent={percent} height={8} />
        <p className="compression-progress-counter">
          {progress.currentIndex} of {progress.total}
        </p>

        {progress.currentFile && (
          <p className="compression-progress-current">
            Current: <span>{progress.currentFile}</span>
          </p>
        )}

        <p className="compression-progress-freed">
          Freed so far: <strong>{formatBytes(progress.bytesFreed)}</strong>
        </p>

        <div className="compression-progress-actions">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={progress.status === "cancelling"}
          >
            {progress.status === "cancelling" ? "Cancelling…" : "Cancel"}
          </Button>
          <Button variant="primary" onClick={onRunInBackground}>
            Run in Background
          </Button>
        </div>
      </div>
    </div>
  );
}

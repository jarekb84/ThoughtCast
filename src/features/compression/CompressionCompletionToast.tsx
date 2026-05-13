import { Button } from "../../shared/components";
import { formatBytes } from "./formatBytes";
import type { BatchCompletionSummary } from "./useCompressionBatch";
import "./CompressionCompletionToast.css";

interface CompressionCompletionToastProps {
  summary: BatchCompletionSummary;
  onDismiss: () => void;
}

export default function CompressionCompletionToast({
  summary,
  onDismiss,
}: CompressionCompletionToastProps) {
  const headline = summary.cancelled
    ? "Compression cancelled"
    : "Compression complete";

  return (
    <div className="compression-toast" role="status">
      <div className="compression-toast-text">
        <strong>{headline}</strong>
        <span>
          Compressed {summary.compressed} of {summary.total} files
          {summary.skipped > 0 && ` · skipped ${summary.skipped}`}
          {" · freed "}
          {formatBytes(summary.bytesFreed)}
        </span>
      </div>
      <Button variant="secondary" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

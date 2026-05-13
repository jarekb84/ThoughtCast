import { StorageStats } from "./compressionTypes";
import { formatBytes } from "./formatBytes";
import "./CompressionStorageSummary.css";

interface CompressionStorageSummaryProps {
  stats: StorageStats | null;
}

export default function CompressionStorageSummary({
  stats,
}: CompressionStorageSummaryProps) {
  if (!stats) {
    return (
      <p className="compression-storage-summary-loading">
        Counting recordings…
      </p>
    );
  }

  return (
    <div className="compression-storage-summary">
      <strong>Current storage:</strong>
      <ul>
        <li>
          {stats.wavCount} WAV file{stats.wavCount === 1 ? "" : "s"} (
          {formatBytes(stats.wavBytes)})
        </li>
        <li>
          {stats.m4aCount} compressed file{stats.m4aCount === 1 ? "" : "s"}
          {stats.m4aCount > 0 && ` (${formatBytes(stats.m4aBytes)})`}
        </li>
        {stats.wavBytes > 0 && (
          <li>
            Estimated savings if compressed: ~
            {formatBytes(stats.estimatedSavingsBytes)}
          </li>
        )}
      </ul>
    </div>
  );
}

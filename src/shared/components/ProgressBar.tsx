import './ProgressBar.css';

interface ProgressBarProps {
  /** Progress percentage (0-100) */
  percent: number;
  /** Optional height in pixels (default: 4) */
  height?: number;
  /** Optional CSS class for custom styling */
  className?: string;
}

/**
 * Simple progress bar component
 *
 * Displays a horizontal progress bar with smooth animations.
 * Used for showing transcription progress.
 */
export function ProgressBar({
  percent,
  height = 4,
  className = '',
}: ProgressBarProps) {
  const clampedPercent = Math.max(0, Math.min(100, percent));

  return (
    <div
      className={`progress-bar-container ${className}`}
      style={{ height: `${height}px` }}
    >
      <div
        className="progress-bar-fill"
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  );
}

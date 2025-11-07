import { useEffect, useRef } from "react";
import { renderAudioLevels } from "./audioLevelRenderer";
import "./AudioLevelIndicator.css";

interface AudioLevelIndicatorProps {
  /** Array of audio amplitude values (0.0-1.0) */
  levels: number[];
}

/**
 * Audio level indicator component
 *
 * Displays a scrolling bar graph visualization of recent audio levels.
 * Shows approximately 1 second of audio history with bars representing
 * amplitude at different time points.
 */
export default function AudioLevelIndicator({ levels }: AudioLevelIndicatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    renderAudioLevels(ctx, levels, {
      width: canvas.width,
      height: canvas.height,
      barSpacing: 1,
    });
  }, [levels]);

  return (
    <div className="audio-level-indicator">
      <canvas
        ref={canvasRef}
        width={200}
        height={28}
        className="audio-level-canvas"
        aria-label="Real-time audio level visualization"
        role="img"
      />
    </div>
  );
}

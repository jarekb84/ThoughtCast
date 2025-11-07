/**
 * Audio level visualization renderer
 *
 * Pure functions for rendering audio level visualizations on Canvas.
 * Separated from React components for testability and reusability.
 */

export interface AudioLevelRenderConfig {
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;
  /** Spacing between bars in pixels */
  barSpacing?: number;
}

export interface AudioLevelColor {
  threshold: number;
  color: string;
}

/**
 * Default color gradient for audio levels
 * Matches design system with muted, harmonious colors
 */
const DEFAULT_COLOR_GRADIENT: AudioLevelColor[] = [
  { threshold: 0.3, color: '#5da283' }, // Quiet - muted sage green
  { threshold: 0.6, color: '#d9a066' }, // Medium - muted amber
  { threshold: 0.8, color: '#d08055' }, // Medium-loud - muted orange
  { threshold: 1.0, color: '#c96b6b' }, // Loud - muted red
];

/**
 * Select color based on audio level
 */
export function selectColorForLevel(
  level: number,
  gradient: AudioLevelColor[] = DEFAULT_COLOR_GRADIENT
): string {
  for (const { threshold, color } of gradient) {
    if (level < threshold) {
      return color;
    }
  }
  // Return last color if level exceeds all thresholds
  return gradient[gradient.length - 1].color;
}

/**
 * Calculate opacity fade based on bar position
 * Older bars (toward the left) are more faded
 */
export function calculateBarOpacity(
  barIndex: number,
  totalBars: number,
  minOpacity: number = 0.5,
  maxOpacity: number = 1.0
): number {
  const recency = (barIndex + 1) / totalBars;
  return minOpacity + recency * (maxOpacity - minOpacity);
}

/**
 * Render audio levels as a bar graph on Canvas
 *
 * @param ctx - Canvas 2D rendering context
 * @param levels - Array of amplitude values (0.0-1.0)
 * @param config - Rendering configuration
 * @param colorGradient - Optional custom color gradient
 */
export function renderAudioLevels(
  ctx: CanvasRenderingContext2D,
  levels: number[],
  config: AudioLevelRenderConfig,
  colorGradient: AudioLevelColor[] = DEFAULT_COLOR_GRADIENT
): void {
  const { width, height, barSpacing = 1 } = config;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  if (levels.length === 0) {
    return;
  }

  // Calculate bar dimensions
  const barCount = levels.length;
  const barWidth = Math.floor(width / barCount);
  const effectiveBarWidth = barWidth - barSpacing;

  // Draw each bar
  levels.forEach((level, index) => {
    const barHeight = Math.max(2, level * height);
    const x = index * barWidth;
    const y = height - barHeight;

    // Select color and apply opacity fade
    const color = selectColorForLevel(level, colorGradient);
    const opacity = calculateBarOpacity(index, barCount);

    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, effectiveBarWidth, barHeight);
  });

  // Reset global alpha
  ctx.globalAlpha = 1.0;
}

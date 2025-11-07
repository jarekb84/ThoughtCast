import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  selectColorForLevel,
  calculateBarOpacity,
  renderAudioLevels,
  type AudioLevelColor,
  type AudioLevelRenderConfig,
} from './audioLevelRenderer';

describe('audioLevelRenderer', () => {
  describe('selectColorForLevel', () => {
    const testGradient: AudioLevelColor[] = [
      { threshold: 0.3, color: '#green' },
      { threshold: 0.6, color: '#amber' },
      { threshold: 0.8, color: '#orange' },
      { threshold: 1.0, color: '#red' },
    ];

    it('should return first color for low levels', () => {
      expect(selectColorForLevel(0.0, testGradient)).toBe('#green');
      expect(selectColorForLevel(0.15, testGradient)).toBe('#green');
      expect(selectColorForLevel(0.29, testGradient)).toBe('#green');
    });

    it('should return second color for medium levels', () => {
      expect(selectColorForLevel(0.3, testGradient)).toBe('#amber');
      expect(selectColorForLevel(0.45, testGradient)).toBe('#amber');
      expect(selectColorForLevel(0.59, testGradient)).toBe('#amber');
    });

    it('should return third color for medium-loud levels', () => {
      expect(selectColorForLevel(0.6, testGradient)).toBe('#orange');
      expect(selectColorForLevel(0.7, testGradient)).toBe('#orange');
      expect(selectColorForLevel(0.79, testGradient)).toBe('#orange');
    });

    it('should return fourth color for loud levels', () => {
      expect(selectColorForLevel(0.8, testGradient)).toBe('#red');
      expect(selectColorForLevel(0.9, testGradient)).toBe('#red');
      expect(selectColorForLevel(1.0, testGradient)).toBe('#red');
    });

    it('should handle levels exceeding maximum threshold', () => {
      expect(selectColorForLevel(1.5, testGradient)).toBe('#red');
      expect(selectColorForLevel(2.0, testGradient)).toBe('#red');
    });

    it('should use default gradient when not provided', () => {
      // Default gradient starts with sage green
      const color = selectColorForLevel(0.1);
      expect(color).toBe('#5da283');
    });
  });

  describe('calculateBarOpacity', () => {
    it('should return max opacity for newest bar (last index)', () => {
      const opacity = calculateBarOpacity(19, 20);
      expect(opacity).toBeCloseTo(1.0);
    });

    it('should return min opacity for oldest bar (first index)', () => {
      const opacity = calculateBarOpacity(0, 20);
      // Bar 0 of 20: (0 + 1) / 20 = 0.05, so 0.5 + 0.05 * 0.5 = 0.525
      expect(opacity).toBeCloseTo(0.525);
    });

    it('should return interpolated opacity for middle bars', () => {
      const opacity = calculateBarOpacity(10, 20);
      // Bar 10 of 20: (10 + 1) / 20 = 0.55, so 0.5 + 0.55 * 0.5 = 0.775
      expect(opacity).toBeCloseTo(0.775);
    });

    it('should respect custom opacity range', () => {
      const opacity = calculateBarOpacity(0, 20, 0.3, 0.9);
      // Bar 0 of 20: (0 + 1) / 20 = 0.05, so 0.3 + 0.05 * 0.6 = 0.33
      expect(opacity).toBeCloseTo(0.33);
    });

    it('should handle single bar', () => {
      const opacity = calculateBarOpacity(0, 1);
      expect(opacity).toBeCloseTo(1.0); // Only bar should be fully visible
    });

    it('should produce monotonically increasing opacity', () => {
      const opacities = Array.from({ length: 20 }, (_, i) =>
        calculateBarOpacity(i, 20)
      );

      for (let i = 1; i < opacities.length; i++) {
        expect(opacities[i]).toBeGreaterThanOrEqual(opacities[i - 1]);
      }
    });
  });

  describe('renderAudioLevels', () => {
    let mockCtx: CanvasRenderingContext2D;

    beforeEach(() => {
      mockCtx = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        globalAlpha: 1.0,
        fillStyle: '',
      } as unknown as CanvasRenderingContext2D;
    });

    it('should clear canvas before rendering', () => {
      const config: AudioLevelRenderConfig = { width: 200, height: 32 };
      renderAudioLevels(mockCtx, [0.5], config);

      expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 200, 32);
    });

    it('should not draw bars for empty levels array', () => {
      const config: AudioLevelRenderConfig = { width: 200, height: 32 };
      renderAudioLevels(mockCtx, [], config);

      expect(mockCtx.fillRect).not.toHaveBeenCalled();
    });

    it('should draw correct number of bars', () => {
      const config: AudioLevelRenderConfig = { width: 200, height: 32 };
      renderAudioLevels(mockCtx, [0.5, 0.6, 0.7], config);

      expect(mockCtx.fillRect).toHaveBeenCalledTimes(3);
    });

    it('should calculate bar positions correctly', () => {
      const config: AudioLevelRenderConfig = { width: 200, height: 32 };
      renderAudioLevels(mockCtx, [0.5, 0.5], config);

      // Width 200, 2 bars = 100px per bar
      // First bar at x=0, second at x=100
      const calls = (mockCtx.fillRect as any).mock.calls;
      expect(calls[0][0]).toBe(0); // First bar x position
      expect(calls[1][0]).toBe(100); // Second bar x position
    });

    it('should calculate bar heights proportional to levels', () => {
      const config: AudioLevelRenderConfig = { width: 200, height: 32 };
      renderAudioLevels(mockCtx, [0.25, 0.5, 0.75], config);

      const calls = (mockCtx.fillRect as any).mock.calls;
      const height1 = calls[0][3]; // 25% of 32 = 8
      const height2 = calls[1][3]; // 50% of 32 = 16
      const height3 = calls[2][3]; // 75% of 32 = 24

      expect(height1).toBeCloseTo(8, 0);
      expect(height2).toBeCloseTo(16, 0);
      expect(height3).toBeCloseTo(24, 0);
    });

    it('should respect custom bar spacing', () => {
      const config: AudioLevelRenderConfig = {
        width: 200,
        height: 32,
        barSpacing: 5,
      };
      renderAudioLevels(mockCtx, [0.5], config);

      const calls = (mockCtx.fillRect as any).mock.calls;
      // Bar width should be (200 / 1) - 5 = 195
      expect(calls[0][2]).toBe(195);
    });

    it('should enforce minimum bar height of 2px', () => {
      const config: AudioLevelRenderConfig = { width: 200, height: 32 };
      renderAudioLevels(mockCtx, [0.0], config); // Zero amplitude

      const calls = (mockCtx.fillRect as any).mock.calls;
      expect(calls[0][3]).toBe(2); // Minimum height
    });

    it('should apply opacity fade from old to new bars', () => {
      const config: AudioLevelRenderConfig = { width: 200, height: 32 };
      const opacities: number[] = [];

      // Capture opacity values as they're set
      Object.defineProperty(mockCtx, 'globalAlpha', {
        set: (value: number) => opacities.push(value),
        get: () => 1.0,
      });

      renderAudioLevels(mockCtx, [0.5, 0.5, 0.5], config);

      // Should have increasing opacity values
      expect(opacities.length).toBeGreaterThan(0);
      for (let i = 1; i < opacities.length - 1; i++) {
        expect(opacities[i]).toBeGreaterThanOrEqual(opacities[i - 1]);
      }
    });

    it('should reset global alpha after rendering', () => {
      const config: AudioLevelRenderConfig = { width: 200, height: 32 };
      renderAudioLevels(mockCtx, [0.5], config);

      expect(mockCtx.globalAlpha).toBe(1.0);
    });

    it('should use custom color gradient when provided', () => {
      const config: AudioLevelRenderConfig = { width: 200, height: 32 };
      const customGradient: AudioLevelColor[] = [
        { threshold: 1.0, color: '#custom' },
      ];

      renderAudioLevels(mockCtx, [0.5], config, customGradient);

      expect(mockCtx.fillStyle).toBe('#custom');
    });

    it('should handle varying amplitude levels', () => {
      const config: AudioLevelRenderConfig = { width: 200, height: 32 };
      const levels = [0.1, 0.4, 0.7, 0.9];

      renderAudioLevels(mockCtx, levels, config);

      const calls = (mockCtx.fillRect as any).mock.calls;
      const heights = calls.map((call: any) => call[3]);

      // Heights should increase with amplitude
      for (let i = 1; i < heights.length; i++) {
        expect(heights[i]).toBeGreaterThan(heights[i - 1]);
      }
    });
  });
});

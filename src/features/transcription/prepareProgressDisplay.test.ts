import { describe, it, expect } from 'vitest';
import { prepareProgressDisplay } from './prepareProgressDisplay';
import { TranscriptionProgress } from '../../api';

const mockFormatDuration = (seconds: number): string => `${Math.round(seconds)}s`;

const baseProgress: TranscriptionProgress = {
  estimatedSeconds: null,
  elapsedSeconds: 0,
  progressPercent: 0,
  hasEstimate: false,
  remainingSeconds: null,
  chunkInfo: null,
};

describe('prepareProgressDisplay', () => {
  it('should not display when no estimate and no chunk info', () => {
    const result = prepareProgressDisplay(
      { ...baseProgress, elapsedSeconds: 5 },
      mockFormatDuration
    );

    expect(result.shouldDisplay).toBe(false);
    expect(result.estimatedText).toBe('');
    expect(result.remainingText).toBe(null);
    expect(result.progressPercent).toBe(0);
    expect(result.chunkLabel).toBe(null);
  });

  it('should display progress when estimate is available', () => {
    const result = prepareProgressDisplay(
      {
        ...baseProgress,
        estimatedSeconds: 60,
        elapsedSeconds: 20,
        progressPercent: 33,
        hasEstimate: true,
        remainingSeconds: 40,
      },
      mockFormatDuration
    );

    expect(result.shouldDisplay).toBe(true);
    expect(result.estimatedText).toBe('~60s');
    expect(result.remainingText).toBe('(40s remaining)');
    expect(result.progressPercent).toBe(33);
    expect(result.chunkLabel).toBe(null);
  });

  it('should not show remaining time when zero or null', () => {
    const resultZero = prepareProgressDisplay(
      {
        ...baseProgress,
        estimatedSeconds: 60,
        elapsedSeconds: 60,
        progressPercent: 95,
        hasEstimate: true,
        remainingSeconds: 0,
      },
      mockFormatDuration
    );

    expect(resultZero.shouldDisplay).toBe(true);
    expect(resultZero.estimatedText).toBe('~60s');
    expect(resultZero.remainingText).toBe(null);

    const resultNull = prepareProgressDisplay(
      {
        ...baseProgress,
        estimatedSeconds: 60,
        elapsedSeconds: 60,
        progressPercent: 95,
        hasEstimate: true,
        remainingSeconds: null,
      },
      mockFormatDuration
    );
    expect(resultNull.remainingText).toBe(null);
  });

  it('should not show remaining time when negative', () => {
    const result = prepareProgressDisplay(
      {
        ...baseProgress,
        estimatedSeconds: 60,
        elapsedSeconds: 70,
        progressPercent: 95,
        hasEstimate: true,
        remainingSeconds: -10,
      },
      mockFormatDuration
    );

    expect(result.remainingText).toBe(null);
  });

  it('should use provided format function for durations', () => {
    const customFormat = (s: number) => `${s} seconds`;
    const result = prepareProgressDisplay(
      {
        ...baseProgress,
        estimatedSeconds: 120,
        elapsedSeconds: 30,
        progressPercent: 25,
        hasEstimate: true,
        remainingSeconds: 90,
      },
      customFormat
    );

    expect(result.estimatedText).toBe('~120 seconds');
    expect(result.remainingText).toBe('(90 seconds remaining)');
  });

  it('should handle edge case of estimate without hasEstimate flag', () => {
    const result = prepareProgressDisplay(
      {
        ...baseProgress,
        estimatedSeconds: 60,
        elapsedSeconds: 10,
        progressPercent: 16,
        hasEstimate: false, // Inconsistent state
        remainingSeconds: 50,
      },
      mockFormatDuration
    );

    expect(result.shouldDisplay).toBe(false);
  });

  it('should format chunk label from chunkInfo', () => {
    const result = prepareProgressDisplay(
      {
        ...baseProgress,
        estimatedSeconds: 60,
        elapsedSeconds: 20,
        progressPercent: 33,
        hasEstimate: true,
        remainingSeconds: 40,
        chunkInfo: { current: 2, total: 3 },
      },
      mockFormatDuration
    );

    expect(result.chunkLabel).toBe('chunk 2 of 3');
  });

  it('should show chunk label even before historical estimate arrives', () => {
    // A chunked recording may emit chunk 1 of N before the estimator finishes.
    // We want the UI to immediately show position so the user sees something.
    const result = prepareProgressDisplay(
      {
        ...baseProgress,
        chunkInfo: { current: 1, total: 4 },
      },
      mockFormatDuration
    );

    expect(result.shouldDisplay).toBe(true);
    expect(result.chunkLabel).toBe('chunk 1 of 4');
    expect(result.estimatedText).toBe('');
  });
});

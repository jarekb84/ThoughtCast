import { describe, it, expect } from 'vitest';
import { prepareProgressDisplay } from './prepareProgressDisplay';
import { TranscriptionProgress } from '../../api';

const mockFormatDuration = (seconds: number): string => `${Math.round(seconds)}s`;

describe('prepareProgressDisplay', () => {
  it('should not display when no estimate available', () => {
    const progress: TranscriptionProgress = {
      estimatedSeconds: null,
      elapsedSeconds: 5,
      progressPercent: 0,
      hasEstimate: false,
      remainingSeconds: null,
    };

    const result = prepareProgressDisplay(progress, mockFormatDuration);

    expect(result.shouldDisplay).toBe(false);
    expect(result.estimatedText).toBe('');
    expect(result.remainingText).toBe(null);
    expect(result.progressPercent).toBe(0);
  });

  it('should display progress when estimate is available', () => {
    const progress: TranscriptionProgress = {
      estimatedSeconds: 60,
      elapsedSeconds: 20,
      progressPercent: 33,
      hasEstimate: true,
      remainingSeconds: 40,
    };

    const result = prepareProgressDisplay(progress, mockFormatDuration);

    expect(result.shouldDisplay).toBe(true);
    expect(result.estimatedText).toBe('~60s');
    expect(result.remainingText).toBe('(40s remaining)');
    expect(result.progressPercent).toBe(33);
  });

  it('should not show remaining time when zero or null', () => {
    const progressZero: TranscriptionProgress = {
      estimatedSeconds: 60,
      elapsedSeconds: 60,
      progressPercent: 95,
      hasEstimate: true,
      remainingSeconds: 0,
    };

    const resultZero = prepareProgressDisplay(progressZero, mockFormatDuration);

    expect(resultZero.shouldDisplay).toBe(true);
    expect(resultZero.estimatedText).toBe('~60s');
    expect(resultZero.remainingText).toBe(null);

    const progressNull: TranscriptionProgress = {
      estimatedSeconds: 60,
      elapsedSeconds: 60,
      progressPercent: 95,
      hasEstimate: true,
      remainingSeconds: null,
    };

    const resultNull = prepareProgressDisplay(progressNull, mockFormatDuration);
    expect(resultNull.remainingText).toBe(null);
  });

  it('should not show remaining time when negative', () => {
    const progress: TranscriptionProgress = {
      estimatedSeconds: 60,
      elapsedSeconds: 70,
      progressPercent: 95,
      hasEstimate: true,
      remainingSeconds: -10,
    };

    const result = prepareProgressDisplay(progress, mockFormatDuration);

    expect(result.remainingText).toBe(null);
  });

  it('should use provided format function for durations', () => {
    const customFormat = (s: number) => `${s} seconds`;
    const progress: TranscriptionProgress = {
      estimatedSeconds: 120,
      elapsedSeconds: 30,
      progressPercent: 25,
      hasEstimate: true,
      remainingSeconds: 90,
    };

    const result = prepareProgressDisplay(progress, customFormat);

    expect(result.estimatedText).toBe('~120 seconds');
    expect(result.remainingText).toBe('(90 seconds remaining)');
  });

  it('should handle edge case of estimate without hasEstimate flag', () => {
    const progress: TranscriptionProgress = {
      estimatedSeconds: 60,
      elapsedSeconds: 10,
      progressPercent: 16,
      hasEstimate: false, // Inconsistent state
      remainingSeconds: 50,
    };

    const result = prepareProgressDisplay(progress, mockFormatDuration);

    expect(result.shouldDisplay).toBe(false);
  });
});

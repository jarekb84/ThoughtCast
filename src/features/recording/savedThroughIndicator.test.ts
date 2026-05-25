import { describe, it, expect } from 'vitest';
import { deriveSavedThroughIndicator } from './savedThroughIndicator';

describe('deriveSavedThroughIndicator', () => {
  it('returns null when no flush has been reported yet', () => {
    expect(deriveSavedThroughIndicator(null, 0)).toBeNull();
    expect(deriveSavedThroughIndicator(null, 30)).toBeNull();
  });

  it('returns null when nothing has been flushed yet (0s)', () => {
    expect(deriveSavedThroughIndicator(0, 1)).toBeNull();
  });

  it('formats a healthy flush state as "Saved through MM:SS"', () => {
    const result = deriveSavedThroughIndicator(123, 124);
    expect(result).toEqual({ label: 'Saved through 2:03', isFalling: false });
  });

  it('marks the indicator as falling when the writer is more than 5s behind', () => {
    const result = deriveSavedThroughIndicator(60, 90);
    expect(result?.isFalling).toBe(true);
  });

  it('does not mark falling for a tiny lag', () => {
    const result = deriveSavedThroughIndicator(60, 62);
    expect(result?.isFalling).toBe(false);
  });

  it('handles flushed > duration (clock-skew safety) without panicking', () => {
    const result = deriveSavedThroughIndicator(70, 60);
    expect(result?.isFalling).toBe(false);
  });
});

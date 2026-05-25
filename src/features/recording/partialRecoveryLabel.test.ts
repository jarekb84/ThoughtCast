import { describe, it, expect } from 'vitest';
import { formatPartialDurationLabel } from './partialRecoveryLabel';

describe('formatPartialDurationLabel', () => {
  it('returns "before any audio" when duration rounds to zero', () => {
    expect(formatPartialDurationLabel(0)).toBe('before any audio was captured');
    expect(formatPartialDurationLabel(0.4)).toBe('before any audio was captured');
  });

  it('formats sub-minute durations as seconds only', () => {
    expect(formatPartialDurationLabel(5)).toBe('~5s of audio');
    expect(formatPartialDurationLabel(37.4)).toBe('~37s of audio');
    // rounding up crosses the minute boundary
    expect(formatPartialDurationLabel(59.6)).toBe('~1m 00s of audio');
  });

  it('formats minute-plus durations as MM SS', () => {
    expect(formatPartialDurationLabel(60)).toBe('~1m 00s of audio');
    expect(formatPartialDurationLabel(75)).toBe('~1m 15s of audio');
    expect(formatPartialDurationLabel(605)).toBe('~10m 05s of audio');
  });

  it('clamps negative inputs to zero', () => {
    expect(formatPartialDurationLabel(-1)).toBe('before any audio was captured');
  });
});

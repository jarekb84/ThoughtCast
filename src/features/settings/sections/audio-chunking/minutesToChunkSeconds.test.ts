import { describe, expect, it } from 'vitest';
import { minutesToChunkSeconds } from './minutesToChunkSeconds';

describe('minutesToChunkSeconds', () => {
  it('converts a whole minute count to seconds', () => {
    expect(minutesToChunkSeconds(7)).toBe(420);
    expect(minutesToChunkSeconds(10)).toBe(600);
  });

  it('returns null for zero or negative input', () => {
    expect(minutesToChunkSeconds(0)).toBeNull();
    expect(minutesToChunkSeconds(-3)).toBeNull();
  });

  it('returns null for non-finite input', () => {
    expect(minutesToChunkSeconds(Number.NaN)).toBeNull();
    expect(minutesToChunkSeconds(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('preserves fractional minutes (caller may round before persisting)', () => {
    expect(minutesToChunkSeconds(7.5)).toBe(450);
  });
});

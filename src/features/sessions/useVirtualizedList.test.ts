import { describe, it, expect } from 'vitest';
import { computeVirtualRange } from './useVirtualizedList';

describe('computeVirtualRange', () => {
  it('returns empty range when itemCount is zero', () => {
    const result = computeVirtualRange({
      itemCount: 0,
      itemHeight: 80,
      containerHeight: 600,
      scrollTop: 0,
    });
    expect(result).toEqual({ startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 });
  });

  it('returns empty range when itemHeight is zero', () => {
    const result = computeVirtualRange({
      itemCount: 100,
      itemHeight: 0,
      containerHeight: 600,
      scrollTop: 0,
    });
    expect(result.endIndex).toBe(0);
  });

  it('renders only the first window when scrolled to top', () => {
    const result = computeVirtualRange({
      itemCount: 1400,
      itemHeight: 80,
      containerHeight: 600,
      scrollTop: 0,
      overscan: 5,
    });

    expect(result.startIndex).toBe(0);
    // 600 / 80 = 7.5 -> ceil 8 visible, + 5 overscan past = 13
    expect(result.endIndex).toBe(13);
    expect(result.offsetY).toBe(0);
    expect(result.totalHeight).toBe(1400 * 80);
  });

  it('includes overscan rows before the visible window when scrolled', () => {
    const result = computeVirtualRange({
      itemCount: 1400,
      itemHeight: 80,
      containerHeight: 600,
      scrollTop: 800, // row 10 at top
      overscan: 5,
    });

    expect(result.startIndex).toBe(5); // 10 - 5 overscan
    expect(result.endIndex).toBe(10 + 8 + 5); // raw + visible + overscan = 23
    expect(result.offsetY).toBe(5 * 80);
  });

  it('clamps the end index to itemCount near the bottom of the list', () => {
    const result = computeVirtualRange({
      itemCount: 100,
      itemHeight: 80,
      containerHeight: 600,
      scrollTop: 80 * 95,
      overscan: 5,
    });

    expect(result.endIndex).toBe(100);
    expect(result.startIndex).toBeLessThan(100);
  });

  it('preserves total scroll height regardless of window position', () => {
    const topRange = computeVirtualRange({
      itemCount: 1400,
      itemHeight: 80,
      containerHeight: 600,
      scrollTop: 0,
    });
    const middleRange = computeVirtualRange({
      itemCount: 1400,
      itemHeight: 80,
      containerHeight: 600,
      scrollTop: 50000,
    });

    expect(topRange.totalHeight).toBe(middleRange.totalHeight);
    expect(topRange.totalHeight).toBe(1400 * 80);
  });
});

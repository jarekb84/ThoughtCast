import { describe, it, expect } from 'vitest';
import { calculateProgressPercent } from './calculateProgressPercent';

describe('calculateProgressPercent', () => {
  it('should return 0 when no estimate available', () => {
    const result = calculateProgressPercent(10, null);
    expect(result).toBe(0);
  });

  it('should return 0 when elapsed is 0', () => {
    const result = calculateProgressPercent(0, 100);
    expect(result).toBe(0);
  });

  it('should return 0 when both elapsed and estimate are 0', () => {
    const result = calculateProgressPercent(0, 0);
    expect(result).toBe(0);
  });

  it('should calculate linear progress for normal case', () => {
    const result = calculateProgressPercent(30, 100);
    expect(result).toBe(30);
  });

  it('should calculate 50% progress at midpoint', () => {
    const result = calculateProgressPercent(50, 100);
    expect(result).toBe(50);
  });

  it('should cap at 95% when elapsed equals estimate', () => {
    const result = calculateProgressPercent(100, 100);
    expect(result).toBe(95);
  });

  it('should cap at 95% when elapsed exceeds estimate', () => {
    const result = calculateProgressPercent(120, 100);
    expect(result).toBe(95);
  });

  it('should cap at 95% when elapsed far exceeds estimate', () => {
    const result = calculateProgressPercent(500, 100);
    expect(result).toBe(95);
  });

  it('should handle fractional seconds correctly', () => {
    const result = calculateProgressPercent(33.333, 100);
    expect(result).toBeCloseTo(33.333, 2);
  });

  it('should handle very small elapsed times', () => {
    const result = calculateProgressPercent(0.1, 100);
    expect(result).toBe(0.1);
  });

  it('should handle very large estimate values', () => {
    const result = calculateProgressPercent(1000, 10000);
    expect(result).toBe(10);
  });

  it('should not exceed 95% for any elapsed/estimate ratio', () => {
    const testCases = [
      { elapsed: 95, estimated: 100 },
      { elapsed: 100, estimated: 100 },
      { elapsed: 150, estimated: 100 },
      { elapsed: 1000, estimated: 100 },
    ];

    testCases.forEach(({ elapsed, estimated }) => {
      const result = calculateProgressPercent(elapsed, estimated);
      expect(result).toBeLessThanOrEqual(95);
    });
  });

  it('should return values between 0 and 95 for valid inputs', () => {
    const testCases = [
      { elapsed: 10, estimated: 100 },
      { elapsed: 25, estimated: 100 },
      { elapsed: 50, estimated: 100 },
      { elapsed: 75, estimated: 100 },
      { elapsed: 90, estimated: 100 },
    ];

    testCases.forEach(({ elapsed, estimated }) => {
      const result = calculateProgressPercent(elapsed, estimated);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(95);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { formatDuration } from './duration';

describe('formatDuration', () => {
  describe('zero and small values', () => {
    it('should format zero seconds as 0:00', () => {
      expect(formatDuration(0)).toBe('0:00');
    });

    it('should format single-digit seconds with leading zero', () => {
      expect(formatDuration(5)).toBe('0:05');
    });

    it('should format double-digit seconds', () => {
      expect(formatDuration(45)).toBe('0:45');
    });
  });

  describe('minute boundaries', () => {
    it('should format exactly 60 seconds as 1:00', () => {
      expect(formatDuration(60)).toBe('1:00');
    });

    it('should format exactly 120 seconds as 2:00', () => {
      expect(formatDuration(120)).toBe('2:00');
    });

    it('should format 59 seconds as 0:59', () => {
      expect(formatDuration(59)).toBe('0:59');
    });

    it('should format 61 seconds as 1:01', () => {
      expect(formatDuration(61)).toBe('1:01');
    });
  });

  describe('fractional seconds', () => {
    it('should floor fractional seconds - 5.9 seconds', () => {
      expect(formatDuration(5.9)).toBe('0:05');
    });

    it('should floor fractional seconds - 5.1 seconds', () => {
      expect(formatDuration(5.1)).toBe('0:05');
    });

    it('should floor fractional seconds - 59.9 seconds', () => {
      expect(formatDuration(59.9)).toBe('0:59');
    });

    it('should floor fractional seconds - 60.9 seconds', () => {
      expect(formatDuration(60.9)).toBe('1:00');
    });

    it('should floor fractional seconds - 125.7 seconds', () => {
      expect(formatDuration(125.7)).toBe('2:05');
    });
  });

  describe('standard recording durations', () => {
    it('should format 3:45 correctly', () => {
      expect(formatDuration(225)).toBe('3:45');
    });

    it('should format 10:30 correctly', () => {
      expect(formatDuration(630)).toBe('10:30');
    });

    it('should format 5:03 correctly (leading zero in seconds)', () => {
      expect(formatDuration(303)).toBe('5:03');
    });

    it('should format 12:00 exactly', () => {
      expect(formatDuration(720)).toBe('12:00');
    });
  });

  describe('large values (hours)', () => {
    it('should format 1 hour as 60:00', () => {
      expect(formatDuration(3600)).toBe('60:00');
    });

    it('should format 1.5 hours as 90:00', () => {
      expect(formatDuration(5400)).toBe('90:00');
    });

    it('should format 2 hours as 120:00', () => {
      expect(formatDuration(7200)).toBe('120:00');
    });

    it('should format 2:30:45 as 150:45', () => {
      expect(formatDuration(9045)).toBe('150:45');
    });
  });

  describe('edge cases', () => {
    it('should handle very small fractional values', () => {
      expect(formatDuration(0.1)).toBe('0:00');
    });

    it('should handle negative values (edge case - not expected in production)', () => {
      // While negative durations don't make sense in domain logic,
      // document actual behavior: negative seconds are floored, not wrapped
      expect(formatDuration(-5)).toBe('-1:-5');
    });

    it('should handle very large values', () => {
      expect(formatDuration(99999)).toBe('1666:39');
    });
  });

  describe('padding behavior', () => {
    it('should always pad seconds to 2 digits', () => {
      expect(formatDuration(60)).toBe('1:00');
      expect(formatDuration(61)).toBe('1:01');
      expect(formatDuration(69)).toBe('1:09');
    });

    it('should not pad minutes', () => {
      expect(formatDuration(5)).toBe('0:05');
      expect(formatDuration(600)).toBe('10:00');
      expect(formatDuration(6000)).toBe('100:00');
    });
  });
});

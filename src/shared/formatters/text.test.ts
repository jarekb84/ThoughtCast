import { describe, it, expect } from 'vitest';
import { truncateText } from './text';

describe('truncateText', () => {
  it('should return text unchanged if length is less than max', () => {
    const text = 'Short text';
    expect(truncateText(text)).toBe('Short text');
  });

  it('should return text unchanged if length equals max', () => {
    const text = 'A'.repeat(50);
    expect(truncateText(text)).toBe(text);
  });

  it('should truncate text and add ellipsis if length exceeds max', () => {
    const text = 'A'.repeat(51);
    expect(truncateText(text)).toBe('A'.repeat(50) + '...');
  });

  it('should respect custom maxLength parameter', () => {
    const text = 'This is a longer text that needs truncation';
    expect(truncateText(text, 10)).toBe('This is a ...');
  });

  it('should handle empty string', () => {
    expect(truncateText('')).toBe('');
  });

  it('should handle single character strings', () => {
    expect(truncateText('A')).toBe('A');
  });

  it('should truncate at exact boundary', () => {
    const text = 'This text is exactly twenty chars long for testing purposes';
    expect(truncateText(text, 20)).toBe('This text is exactly...');
  });
});

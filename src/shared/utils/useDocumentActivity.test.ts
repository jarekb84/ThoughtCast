import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { detectActivity, useDocumentActivity } from './useDocumentActivity';

describe('detectActivity', () => {
  it('returns hidden when the document is hidden, regardless of focus', () => {
    expect(detectActivity('hidden', true)).toBe('hidden');
    expect(detectActivity('hidden', false)).toBe('hidden');
  });

  it('returns idle when visible but unfocused', () => {
    expect(detectActivity('visible', false)).toBe('idle');
  });

  it('returns active when visible and focused', () => {
    expect(detectActivity('visible', true)).toBe('active');
  });
});

describe('useDocumentActivity', () => {
  const originalVisibility = Object.getOwnPropertyDescriptor(
    Document.prototype,
    'visibilityState'
  );
  const originalHasFocus = document.hasFocus;

  function setVisibility(value: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => value,
    });
  }

  function setHasFocus(value: boolean) {
    document.hasFocus = () => value;
  }

  afterEach(() => {
    if (originalVisibility) {
      Object.defineProperty(Document.prototype, 'visibilityState', originalVisibility);
    }
    document.hasFocus = originalHasFocus;
  });

  it('reports the initial activity from document state', () => {
    setVisibility('visible');
    setHasFocus(true);

    const { result } = renderHook(() => useDocumentActivity());

    expect(result.current).toBe('active');
  });

  it('transitions to hidden when visibilitychange fires with hidden state', () => {
    setVisibility('visible');
    setHasFocus(true);

    const { result } = renderHook(() => useDocumentActivity());
    expect(result.current).toBe('active');

    act(() => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current).toBe('hidden');
  });

  it('transitions to idle when the window blurs', () => {
    setVisibility('visible');
    setHasFocus(true);

    const { result } = renderHook(() => useDocumentActivity());
    expect(result.current).toBe('active');

    act(() => {
      setHasFocus(false);
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current).toBe('idle');
  });

  it('returns to active when focus is restored', () => {
    setVisibility('visible');
    setHasFocus(false);

    const { result } = renderHook(() => useDocumentActivity());
    expect(result.current).toBe('idle');

    act(() => {
      setHasFocus(true);
      window.dispatchEvent(new Event('focus'));
    });

    expect(result.current).toBe('active');
  });
});

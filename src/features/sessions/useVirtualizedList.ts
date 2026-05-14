import { useEffect, useRef, useState, RefObject } from 'react';

export interface VirtualizedRange {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
}

export interface VirtualizedListOptions {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
  containerHeight: number;
  scrollTop: number;
}

/**
 * Compute the slice of items that should render given a scrollable viewport.
 *
 * Why: rendering all N items keeps every node and CSS layer alive in the
 * compositor. With ~1400 sessions and a 10Hz parent re-render during
 * recording, WebView2 burned ~12% GPU recomputing styles for offscreen rows.
 * Restricting work to the visible window plus an overscan buffer keeps the
 * DOM small (~20 nodes) without flashing blank rows when the user scrolls.
 */
export function computeVirtualRange(opts: VirtualizedListOptions): VirtualizedRange {
  const { itemCount, itemHeight, containerHeight, scrollTop, overscan = 5 } = opts;

  if (itemCount === 0 || itemHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
  }

  const rawStart = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(containerHeight / itemHeight);

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(itemCount, rawStart + visibleCount + overscan);

  return {
    startIndex,
    endIndex,
    offsetY: startIndex * itemHeight,
    totalHeight: itemCount * itemHeight,
  };
}

/**
 * React hook that tracks scroll position on a container and returns the
 * visible item window. Falls back to rendering the first window when the
 * container has not yet measured.
 */
export function useVirtualizedList(
  containerRef: RefObject<HTMLElement | null>,
  itemCount: number,
  itemHeight: number,
  overscan = 5
): VirtualizedRange {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setContainerHeight(container.clientHeight);

    const handleScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        setScrollTop(container.scrollTop);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      setContainerHeight(container.clientHeight);
    });
    resizeObserver.observe(container);

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [containerRef]);

  return computeVirtualRange({
    itemCount,
    itemHeight,
    containerHeight,
    scrollTop,
    overscan,
  });
}

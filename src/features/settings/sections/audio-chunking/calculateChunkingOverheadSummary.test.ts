import { describe, it, expect } from 'vitest';
import { calculateChunkingOverheadSummary } from './calculateChunkingOverheadSummary';
import { Session } from '../../../../api';

function session(overrides: Partial<Session>): Session {
  return {
    id: 'test',
    preview: 'preview',
    timestamp: '2026-01-01T00:00:00Z',
    audio_path: 'audio/test.wav',
    duration: 600,
    ...overrides,
  };
}

describe('calculateChunkingOverheadSummary', () => {
  it('returns null fields when no chunked sessions exist', () => {
    const summary = calculateChunkingOverheadSummary([
      session({ id: 'a' }),
      session({ id: 'b', duration: 300 }),
    ]);

    expect(summary.averageOverheadPerMinute).toBe(null);
    expect(summary.longestAnalysisSeconds).toBe(null);
    expect(summary.longestAnalysisAudioSeconds).toBe(null);
    expect(summary.sampleCount).toBe(0);
  });

  it('ignores sessions with missing analysis seconds', () => {
    const summary = calculateChunkingOverheadSummary([
      session({ id: 'a' }),
      session({ id: 'b', chunking_analysis_seconds: 5, duration: 600 }),
    ]);
    expect(summary.sampleCount).toBe(1);
  });

  it('ignores sessions with zero duration to avoid division-by-zero', () => {
    const summary = calculateChunkingOverheadSummary([
      session({ id: 'a', chunking_analysis_seconds: 5, duration: 0 }),
    ]);
    expect(summary.averageOverheadPerMinute).toBe(null);
    expect(summary.sampleCount).toBe(0);
  });

  it('computes overhead-per-minute as analysis / (duration / 60)', () => {
    const summary = calculateChunkingOverheadSummary([
      // 600s = 10 min, 3s analysis → 0.3s/min
      session({ id: 'a', chunking_analysis_seconds: 3, duration: 600 }),
    ]);
    expect(summary.averageOverheadPerMinute).toBeCloseTo(0.3, 5);
    expect(summary.sampleCount).toBe(1);
  });

  it('uses median across multiple sessions (not mean)', () => {
    // Three sessions: ratios 0.1, 0.3, 5.0 — mean ~1.8, median 0.3.
    const summary = calculateChunkingOverheadSummary([
      session({ id: 'a', chunking_analysis_seconds: 1, duration: 600 }), // 0.1
      session({ id: 'b', chunking_analysis_seconds: 3, duration: 600 }), // 0.3
      session({ id: 'c', chunking_analysis_seconds: 50, duration: 600 }), // 5.0
    ]);
    expect(summary.averageOverheadPerMinute).toBeCloseTo(0.3, 5);
  });

  it('averages the two middle values for an even count', () => {
    const summary = calculateChunkingOverheadSummary([
      session({ id: 'a', chunking_analysis_seconds: 1, duration: 600 }), // 0.1
      session({ id: 'b', chunking_analysis_seconds: 3, duration: 600 }), // 0.3
    ]);
    // Median of [0.1, 0.3] = 0.2
    expect(summary.averageOverheadPerMinute).toBeCloseTo(0.2, 5);
  });

  it('reports the worst-case analysis pass and its audio length', () => {
    const summary = calculateChunkingOverheadSummary([
      session({ id: 'a', chunking_analysis_seconds: 2, duration: 600 }),
      session({ id: 'b', chunking_analysis_seconds: 8.1, duration: 28 * 60 }),
      session({ id: 'c', chunking_analysis_seconds: 4, duration: 1200 }),
    ]);
    expect(summary.longestAnalysisSeconds).toBe(8.1);
    expect(summary.longestAnalysisAudioSeconds).toBe(28 * 60);
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  detectStatusDrift,
  applyDriftAction,
  DriftCallbacks,
} from './recordingStatusDrift';
import { RecordingStatus } from '../../api';

describe('detectStatusDrift', () => {
  describe('when frontend and backend agree', () => {
    const statuses: RecordingStatus[] = ['idle', 'recording', 'paused', 'processing'];
    statuses.forEach((status) => {
      it(`returns 'none' when both are ${status}`, () => {
        expect(detectStatusDrift(status, status)).toEqual({ kind: 'none' });
      });
    });
  });

  describe("when frontend is 'processing'", () => {
    it.each<RecordingStatus>(['idle', 'recording', 'paused'])(
      "returns 'none' even if backend is %s (transcription pipeline owns the state)",
      (backendStatus) => {
        expect(detectStatusDrift('processing', backendStatus)).toEqual({ kind: 'none' });
      }
    );
  });

  describe('restore-from-backend (the reported "top bar reverted" bug)', () => {
    it("restores when frontend idle but backend is recording", () => {
      expect(detectStatusDrift('idle', 'recording')).toEqual({
        kind: 'restore-from-backend',
        backendStatus: 'recording',
      });
    });

    it("restores when frontend idle but backend is paused", () => {
      expect(detectStatusDrift('idle', 'paused')).toEqual({
        kind: 'restore-from-backend',
        backendStatus: 'paused',
      });
    });

    it('mirrors backend silently when frontend says recording but backend says paused', () => {
      expect(detectStatusDrift('recording', 'paused')).toEqual({
        kind: 'restore-from-backend',
        backendStatus: 'paused',
      });
    });

    it('mirrors backend silently when frontend says paused but backend says recording', () => {
      expect(detectStatusDrift('paused', 'recording')).toEqual({
        kind: 'restore-from-backend',
        backendStatus: 'recording',
      });
    });
  });

  describe('announce-unexpected-end', () => {
    it('announces when frontend thinks recording but backend has gone idle', () => {
      expect(detectStatusDrift('recording', 'idle')).toEqual({
        kind: 'announce-unexpected-end',
      });
    });

    it('announces when frontend thinks paused but backend has gone idle', () => {
      expect(detectStatusDrift('paused', 'idle')).toEqual({
        kind: 'announce-unexpected-end',
      });
    });
  });

  describe('backend in processing while frontend is something else', () => {
    it("returns 'none' when frontend idle and backend processing", () => {
      // backend is finishing a stop the UI hasn't observed yet — let the
      // transcription event listeners drive the UI back to idle.
      expect(detectStatusDrift('idle', 'processing')).toEqual({ kind: 'none' });
    });

    it("returns 'none' when frontend recording and backend processing", () => {
      expect(detectStatusDrift('recording', 'processing')).toEqual({ kind: 'none' });
    });

    it("returns 'none' when frontend paused and backend processing", () => {
      expect(detectStatusDrift('paused', 'processing')).toEqual({ kind: 'none' });
    });
  });
});

describe('applyDriftAction', () => {
  function makeCallbacks(): DriftCallbacks & {
    _calls: {
      setRecordingStatus: ReturnType<typeof vi.fn>;
      setStatus: ReturnType<typeof vi.fn>;
      setIsProcessing: ReturnType<typeof vi.fn>;
      setRecordingDuration: ReturnType<typeof vi.fn>;
      loadSessions: ReturnType<typeof vi.fn>;
    };
  } {
    const calls = {
      setRecordingStatus: vi.fn(),
      setStatus: vi.fn(),
      setIsProcessing: vi.fn(),
      setRecordingDuration: vi.fn(),
      loadSessions: vi.fn().mockResolvedValue(undefined),
    };
    return {
      _calls: calls,
      setRecordingStatus: calls.setRecordingStatus,
      setStatus: calls.setStatus,
      setIsProcessing: calls.setIsProcessing,
      setRecordingDuration: calls.setRecordingDuration,
      loadSessions: calls.loadSessions,
    };
  }

  it("'none' triggers zero side effects", () => {
    const cb = makeCallbacks();
    applyDriftAction({ kind: 'none' }, cb);
    expect(cb._calls.setRecordingStatus).not.toHaveBeenCalled();
    expect(cb._calls.setStatus).not.toHaveBeenCalled();
    expect(cb._calls.setIsProcessing).not.toHaveBeenCalled();
    expect(cb._calls.setRecordingDuration).not.toHaveBeenCalled();
    expect(cb._calls.loadSessions).not.toHaveBeenCalled();
  });

  it("'restore-from-backend' (recording) sets recording status + recording message", () => {
    const cb = makeCallbacks();
    applyDriftAction({ kind: 'restore-from-backend', backendStatus: 'recording' }, cb);
    expect(cb._calls.setRecordingStatus).toHaveBeenCalledWith('recording');
    expect(cb._calls.setStatus).toHaveBeenCalledWith('⏺️ Recording...');
    expect(cb._calls.setIsProcessing).not.toHaveBeenCalled();
    expect(cb._calls.loadSessions).not.toHaveBeenCalled();
  });

  it("'restore-from-backend' (paused) sets paused status + paused message", () => {
    const cb = makeCallbacks();
    applyDriftAction({ kind: 'restore-from-backend', backendStatus: 'paused' }, cb);
    expect(cb._calls.setRecordingStatus).toHaveBeenCalledWith('paused');
    expect(cb._calls.setStatus).toHaveBeenCalledWith('⏸️ Recording paused');
  });

  it("'announce-unexpected-end' wipes recording UI and refreshes sessions", () => {
    const cb = makeCallbacks();
    applyDriftAction({ kind: 'announce-unexpected-end' }, cb);
    expect(cb._calls.setRecordingStatus).toHaveBeenCalledWith('idle');
    expect(cb._calls.setIsProcessing).toHaveBeenCalledWith(false);
    expect(cb._calls.setRecordingDuration).toHaveBeenCalledWith(0);
    expect(cb._calls.setStatus).toHaveBeenCalledWith('⚠️ Recording ended unexpectedly');
    expect(cb._calls.loadSessions).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect } from 'vitest';
import {
  isPausedStatus,
  isIdleStatus,
  isRecordingStatus,
  isActiveSession,
} from './recordingStatusChecks';
import { RecordingStatus } from '../../api';

describe('recordingStatusChecks', () => {
  describe('isPausedStatus', () => {
    it('should return true for paused status', () => {
      expect(isPausedStatus('paused')).toBe(true);
    });

    it('should return false for idle status', () => {
      expect(isPausedStatus('idle')).toBe(false);
    });

    it('should return false for recording status', () => {
      expect(isPausedStatus('recording')).toBe(false);
    });
  });

  describe('isIdleStatus', () => {
    it('should return true for idle status', () => {
      expect(isIdleStatus('idle')).toBe(true);
    });

    it('should return false for recording status', () => {
      expect(isIdleStatus('recording')).toBe(false);
    });

    it('should return false for paused status', () => {
      expect(isIdleStatus('paused')).toBe(false);
    });
  });

  describe('isRecordingStatus', () => {
    it('should return true for recording status', () => {
      expect(isRecordingStatus('recording')).toBe(true);
    });

    it('should return false for idle status', () => {
      expect(isRecordingStatus('idle')).toBe(false);
    });

    it('should return false for paused status', () => {
      expect(isRecordingStatus('paused')).toBe(false);
    });
  });

  describe('isActiveSession', () => {
    it('should return true for recording status', () => {
      expect(isActiveSession('recording')).toBe(true);
    });

    it('should return true for paused status', () => {
      expect(isActiveSession('paused')).toBe(true);
    });

    it('should return false for idle status', () => {
      expect(isActiveSession('idle')).toBe(false);
    });
  });

  describe('type safety', () => {
    it('should handle all RecordingStatus values', () => {
      const statuses: RecordingStatus[] = ['idle', 'recording', 'paused'];

      statuses.forEach(status => {
        // These should not throw - just verify they handle all status values
        expect(() => isPausedStatus(status)).not.toThrow();
        expect(() => isIdleStatus(status)).not.toThrow();
        expect(() => isRecordingStatus(status)).not.toThrow();
        expect(() => isActiveSession(status)).not.toThrow();
      });
    });

    it('should return boolean for all status checks', () => {
      const statuses: RecordingStatus[] = ['idle', 'recording', 'paused'];

      statuses.forEach(status => {
        expect(typeof isPausedStatus(status)).toBe('boolean');
        expect(typeof isIdleStatus(status)).toBe('boolean');
        expect(typeof isRecordingStatus(status)).toBe('boolean');
        expect(typeof isActiveSession(status)).toBe('boolean');
      });
    });
  });
});

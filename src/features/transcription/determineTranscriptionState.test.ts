import { describe, it, expect } from 'vitest';
import { determineTranscriptionState } from './determineTranscriptionState';
import { Session } from '../../api';

const createMockSession = (
  preview: string,
  duration: number = 120
): Session => ({
  id: 'test-123',
  timestamp: '2024-11-08T10:00:00Z',
  duration,
  audio_path: '/path/to/audio.wav',
  preview,
});

describe('determineTranscriptionState', () => {
  it('should detect transcription from session preview', () => {
    const session = createMockSession('Processing...');
    const result = determineTranscriptionState(session, false, 60);

    expect(result.isTranscribing).toBe(true);
    expect(result.audioDurationSeconds).toBe(120); // From session
  });

  it('should detect transcription from isProcessing flag', () => {
    const session = createMockSession('Some transcript text');
    const result = determineTranscriptionState(session, true, 60);

    expect(result.isTranscribing).toBe(true);
    expect(result.audioDurationSeconds).toBe(120); // From session
  });

  it('should detect transcription when both conditions are true', () => {
    const session = createMockSession('Processing...');
    const result = determineTranscriptionState(session, true, 60);

    expect(result.isTranscribing).toBe(true);
  });

  it('should not detect transcription when both conditions are false', () => {
    const session = createMockSession('Transcript content here');
    const result = determineTranscriptionState(session, false, 60);

    expect(result.isTranscribing).toBe(false);
    expect(result.audioDurationSeconds).toBe(120);
  });

  it('should use recording duration when no session selected', () => {
    const result = determineTranscriptionState(null, false, 75);

    expect(result.isTranscribing).toBe(false);
    expect(result.audioDurationSeconds).toBe(75); // Fallback to recordingDuration
  });

  it('should detect processing when no session but isProcessing is true', () => {
    const result = determineTranscriptionState(null, true, 90);

    expect(result.isTranscribing).toBe(true);
    expect(result.audioDurationSeconds).toBe(90);
  });

  it('should handle session with zero duration', () => {
    const session = createMockSession('Processing...', 0);
    const result = determineTranscriptionState(session, false, 100);

    expect(result.isTranscribing).toBe(true);
    expect(result.audioDurationSeconds).toBe(0); // From session, even if zero
  });

  it('should prefer session duration over recording duration', () => {
    const session = createMockSession('Some text', 200);
    const result = determineTranscriptionState(session, false, 50);

    expect(result.audioDurationSeconds).toBe(200); // Session duration takes precedence
  });

  it('should handle different preview messages', () => {
    const processingSession = createMockSession('Processing...');
    const errorSession = createMockSession('Transcription failed');
    const emptySession = createMockSession('');

    expect(
      determineTranscriptionState(processingSession, false, 60).isTranscribing
    ).toBe(true);
    expect(
      determineTranscriptionState(errorSession, false, 60).isTranscribing
    ).toBe(false);
    expect(
      determineTranscriptionState(emptySession, false, 60).isTranscribing
    ).toBe(false);
  });
});

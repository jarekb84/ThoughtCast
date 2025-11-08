import { TranscriptionEstimate } from '..';
import { wrapTauriInvoke } from './tauriInvokeWrapper';

/**
 * Service interface for transcription statistics and progress estimation
 */
export interface ITranscriptionStatsService {
  /**
   * Get estimated transcription time based on historical data
   * @param audioDurationSeconds - Duration of the audio file in seconds
   * @returns Transcription estimate or null if insufficient data
   */
  getTranscriptionEstimate(
    audioDurationSeconds: number
  ): Promise<TranscriptionEstimate | null>;
}

/**
 * Tauri implementation of transcription statistics service
 */
export class TauriTranscriptionStatsService
  implements ITranscriptionStatsService
{
  async getTranscriptionEstimate(
    audioDurationSeconds: number
  ): Promise<TranscriptionEstimate | null> {
    return wrapTauriInvoke<TranscriptionEstimate | null>(
      'get_transcription_estimate',
      { audioDurationSeconds },
      'Failed to get transcription estimate',
      'ESTIMATE_FAILED'
    );
  }
}

/**
 * Mock implementation for testing
 */
export class MockTranscriptionStatsService
  implements ITranscriptionStatsService
{
  private shouldReturnEstimate = true;
  private mockRatio = 0.15; // Default: transcription takes 15% of audio duration

  async getTranscriptionEstimate(
    audioDurationSeconds: number
  ): Promise<TranscriptionEstimate | null> {
    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (!this.shouldReturnEstimate) {
      return null; // Simulate insufficient data
    }

    return {
      estimatedSeconds: audioDurationSeconds * this.mockRatio,
      confidence: 'high',
    };
  }

  /**
   * Test utility: Set whether to return an estimate
   */
  setShouldReturnEstimate(value: boolean): void {
    this.shouldReturnEstimate = value;
  }

  /**
   * Test utility: Set the mock ratio (transcription time / audio duration)
   */
  setMockRatio(ratio: number): void {
    this.mockRatio = ratio;
  }
}

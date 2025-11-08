/**
 * Represents a single audio recording session with its metadata and transcription
 */
export interface Session {
  /** Unique identifier for the session (timestamp-based) */
  id: string;
  /** Preview text from the transcript (first 100 chars) */
  preview: string;
  /** ISO 8601 timestamp when the recording was created */
  timestamp: string;
  /** Relative path to the audio file (e.g., "audio/2024-10-31_15-30-00.wav") */
  audio_path: string;
  /** Recording duration in seconds */
  duration: number;
  /** Relative path to the transcript file (e.g., "text/2024-10-31_15-30-00.txt") */
  transcript_path?: string;
  /** Whether the transcript was automatically copied to clipboard */
  clipboard_copied?: boolean;
}

/**
 * Index containing all recording sessions
 */
export interface SessionIndex {
  sessions: Session[];
}

/**
 * Configuration for Whisper.cpp speech-to-text integration
 */
export interface WhisperConfig {
  /** Path to the Whisper.cpp executable */
  whisperPath: string;
  /** Path to the Whisper model file (e.g., ggml-base.bin) */
  modelPath: string;
  /** Optional custom directory for voice notes */
  voiceNotesDir?: string;
}

/**
 * Confidence level for transcription time estimates
 */
export type EstimateConfidence = 'none' | 'low' | 'medium' | 'high';

/**
 * Estimated transcription time based on historical data
 */
export interface TranscriptionEstimate {
  /** Estimated transcription time in seconds */
  estimatedSeconds: number;
  /** Confidence level based on available historical data */
  confidence: EstimateConfidence;
}

/**
 * Progress data for ongoing transcription
 */
export interface TranscriptionProgress {
  /** Estimated total seconds for transcription (null if no estimate available) */
  estimatedSeconds: number | null;
  /** Elapsed seconds since transcription started */
  elapsedSeconds: number;
  /** Progress percentage (0-100) */
  progressPercent: number;
  /** Whether an estimate is available */
  hasEstimate: boolean;
  /** Remaining seconds (estimated - elapsed) */
  remainingSeconds: number | null;
}

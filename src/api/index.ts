// Types
export type { Session, SessionIndex } from './Session';
export type { RecordingStatus } from './RecordingStatus';
export type {
  TranscriptionCompleteEvent,
  TranscriptionErrorEvent,
  TranscriptionProgressEvent,
} from './TranscriptionEvents';
export {
  SESSION_AUDIO_COMPRESSED,
  COMPRESSION_BATCH_PROGRESS,
  COMPRESSION_BATCH_COMPLETE,
} from './CompressionEvents';
export type {
  SessionAudioCompressedPayload,
  CompressionBatchProgressPayload,
  CompressionBatchCompletePayload,
} from './CompressionEvents';
export { RECORDING_CAPTURE_FAILED } from './RecordingFailureEvents';
export type { RecordingCaptureFailedPayload } from './RecordingFailureEvents';
export type {
  TranscriptionEstimate,
  TranscriptionProgress,
  ChunkProgressInfo,
} from '../features/sessions/types';
export { ApiError } from './ApiError';

// Service Interfaces
export type {
  ISessionService,
  IRecordingService,
  ITranscriptService,
  IClipboardService,
  ITranscriptionStatsService,
} from './services';

// Tauri Implementations
export {
  TauriSessionService,
  TauriRecordingService,
  TauriTranscriptService,
  TauriClipboardService,
  TauriTranscriptionStatsService,
} from './services';

// Mock Implementations
export {
  MockSessionService,
  MockRecordingService,
  MockTranscriptService,
  MockClipboardService,
  MockTranscriptionStatsService,
} from './services';

// Context and Hooks
export { ApiProvider, useApi } from './ApiContext';
export type { ApiServices } from './ApiContext';

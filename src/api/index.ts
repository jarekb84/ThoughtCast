// Types
export type { Session, SessionIndex } from './Session';
export { ApiError } from './ApiError';

// Service Interfaces
export type {
  ISessionService,
  IRecordingService,
  ITranscriptService,
  IClipboardService
} from './services';

// Tauri Implementations
export {
  TauriSessionService,
  TauriRecordingService,
  TauriTranscriptService,
  TauriClipboardService
} from './services';

// Mock Implementations
export {
  MockSessionService,
  MockRecordingService,
  MockTranscriptService,
  MockClipboardService
} from './services';

// Context and Hooks
export { ApiProvider, useApi } from './ApiContext';
export type { ApiServices } from './ApiContext';

import { createContext, useContext, ReactNode, useMemo } from 'react';
import {
  ISessionService,
  IRecordingService,
  ITranscriptService,
  IClipboardService,
  TauriSessionService,
  TauriRecordingService,
  TauriTranscriptService,
  TauriClipboardService
} from './services';

/**
 * API services available to the application
 */
export interface ApiServices {
  sessionService: ISessionService;
  recordingService: IRecordingService;
  transcriptService: ITranscriptService;
  clipboardService: IClipboardService;
}

/**
 * Context for dependency injection of API services
 */
const ApiContext = createContext<ApiServices | null>(null);

/**
 * Props for ApiProvider
 */
interface ApiProviderProps {
  children: ReactNode;
  /**
   * Optional custom services for testing
   * If not provided, uses Tauri implementations
   */
  services?: ApiServices;
}

/**
 * Provider component for API services
 *
 * Provides all API services to child components via React context.
 * Services can be overridden for testing by passing custom implementations.
 *
 * @example
 * // Production usage with Tauri
 * <ApiProvider>
 *   <App />
 * </ApiProvider>
 *
 * @example
 * // Testing with mocks
 * <ApiProvider services={mockServices}>
 *   <ComponentUnderTest />
 * </ApiProvider>
 */
export function ApiProvider({ children, services }: ApiProviderProps) {
  const defaultServices = useMemo<ApiServices>(() => ({
    sessionService: new TauriSessionService(),
    recordingService: new TauriRecordingService(),
    transcriptService: new TauriTranscriptService(),
    clipboardService: new TauriClipboardService()
  }), []);

  const apiServices = services ?? defaultServices;

  return (
    <ApiContext.Provider value={apiServices}>
      {children}
    </ApiContext.Provider>
  );
}

/**
 * Hook to access API services
 *
 * @throws {Error} If used outside of ApiProvider
 *
 * @example
 * function MyComponent() {
 *   const { sessionService } = useApi();
 *   const sessions = await sessionService.getSessions();
 * }
 */
export function useApi(): ApiServices {
  const context = useContext(ApiContext);

  if (!context) {
    throw new Error('useApi must be used within an ApiProvider');
  }

  return context;
}

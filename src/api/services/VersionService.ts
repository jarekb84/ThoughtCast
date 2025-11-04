import { wrapTauriInvoke } from './tauriInvokeWrapper';

/**
 * Service for retrieving application version information
 */
export class VersionService {
  /**
   * Get the current application version from Tauri package info
   * @returns Promise resolving to version string (e.g., "0.1.5" or "0.1.5-3")
   */
  async getAppVersion(): Promise<string> {
    return wrapTauriInvoke<string>(
      'get_app_version',
      undefined,
      'Failed to retrieve app version',
      'VERSION_FETCH_FAILED'
    );
  }
}

export const versionService = new VersionService();

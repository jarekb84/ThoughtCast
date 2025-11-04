import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { versionService } from '../api/services/VersionService';
import { logger } from '../shared/utils/logger';

/**
 * Hook to get and display the app version in the window title
 */
export function useAppVersion() {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    async function fetchAndSetVersion() {
      try {
        const appVersion = await versionService.getAppVersion();
        setVersion(appVersion);

        // Update window title with version
        const window = getCurrentWindow();
        await window.setTitle(`ThoughtCast v${appVersion}`);
      } catch (error) {
        logger.error('Failed to get app version:', error);
        // Fallback to default title (catch any window API errors too)
        try {
          const window = getCurrentWindow();
          await window.setTitle('ThoughtCast');
        } catch (titleError) {
          // Silent fail - window title is cosmetic
          logger.error('Failed to set window title:', titleError);
        }
      }
    }

    fetchAndSetVersion();
  }, []);

  return version;
}

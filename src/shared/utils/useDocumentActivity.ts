import { useEffect, useState } from 'react';

export type DocumentActivity = 'active' | 'idle' | 'hidden';

/**
 * Classify the window's user-attention level from raw browser signals.
 *
 * - `hidden`: minimized, on another desktop, or behind a fullscreen app —
 *   the WebView cannot paint to the user. Pause expensive work entirely.
 * - `idle`: visible but unfocused (user is in another window). The audio
 *   visualization is still on screen if the window peeks out, but the user
 *   is not actively watching, so we can poll less aggressively.
 * - `active`: the window has keyboard focus. Use the normal polling rate.
 */
export function detectActivity(
  visibility: DocumentVisibilityState,
  hasFocus: boolean
): DocumentActivity {
  if (visibility === 'hidden') return 'hidden';
  if (!hasFocus) return 'idle';
  return 'active';
}

/**
 * React hook returning the current user-attention level. Re-renders on
 * `visibilitychange` and window focus/blur events.
 */
export function useDocumentActivity(): DocumentActivity {
  const [activity, setActivity] = useState<DocumentActivity>(() =>
    detectActivity(document.visibilityState, document.hasFocus())
  );

  useEffect(() => {
    const update = () => {
      setActivity(detectActivity(document.visibilityState, document.hasFocus()));
    };

    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);

    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, []);

  return activity;
}

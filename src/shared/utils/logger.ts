/**
 * Application logger utility
 *
 * Centralized logging that can be controlled via environment variables
 * and extended with proper logging infrastructure (toasts, observability, etc.)
 *
 * @example
 * ```typescript
 * import { logger } from '@/shared/utils/logger';
 *
 * logger.error('Failed to load data:', error);
 * logger.warn('Deprecated API called');
 * logger.info('User logged in');
 * ```
 */

/**
 * Check if debug logging is enabled
 * Set VITE_DEBUG_LOGS=true in .env.local to enable console output
 */
const isDebugEnabled = import.meta.env.VITE_DEBUG_LOGS === 'true';

/**
 * Logger interface for structured logging
 */
export const logger = {
  /**
   * Log error messages
   * In production, these could be sent to error tracking service
   */
  error: (...args: unknown[]): void => {
    if (isDebugEnabled) {
      console.error(...args);
    }
    // Future: Send to error tracking service (Sentry, etc.)
    // Future: Show error toast to user
  },

  /**
   * Log warning messages
   */
  warn: (...args: unknown[]): void => {
    if (isDebugEnabled) {
      console.warn(...args);
    }
    // Future: Send to monitoring service
  },

  /**
   * Log informational messages
   */
  info: (...args: unknown[]): void => {
    if (isDebugEnabled) {
      console.info(...args);
    }
    // Future: Send to analytics
  },

  /**
   * Log debug messages (verbose)
   */
  debug: (...args: unknown[]): void => {
    if (isDebugEnabled) {
      console.log(...args);
    }
  },
};

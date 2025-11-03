import { invoke } from '@tauri-apps/api/core';
import { ApiError } from '..';

/**
 * Wraps a Tauri invoke call with consistent error handling
 *
 * Automatically catches errors from invoke() and wraps them in ApiError
 * with appropriate context and error codes.
 *
 * @param command - The Tauri command name
 * @param args - Optional arguments to pass to the command
 * @param errorMessage - User-friendly error message
 * @param errorCode - Error code for categorization
 * @returns The result from the Tauri command
 * @throws {ApiError} If the command fails
 *
 * @example
 * return wrapTauriInvoke(
 *   'get_sessions',
 *   undefined,
 *   'Failed to load sessions',
 *   'SESSION_LOAD_FAILED'
 * );
 */
export async function wrapTauriInvoke<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  errorMessage: string,
  errorCode: string
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new ApiError(errorMessage, error, errorCode);
  }
}

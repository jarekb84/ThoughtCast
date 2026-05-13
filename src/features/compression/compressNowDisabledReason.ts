/**
 * Decide whether the "Compress now" action should be enabled, and if not, why.
 *
 * Encapsulates the precedence rules:
 *   1. FFmpeg must be configured at all.
 *   2. Another batch must not already be running.
 *   3. We must not be mid-spin-up of a new batch.
 *
 * Returning `undefined` means the action is enabled. A string return doubles
 * as both the disabled tooltip and the inline hint message.
 *
 * Kept as a pure function (no React, no hooks) so the precedence ordering is
 * testable in isolation and never drifts inside a `.tsx` ternary.
 */
export function resolveCompressNowDisabledReason(input: {
  ffmpegConfigured: boolean;
  isRunning: boolean;
  isStarting: boolean;
}): string | undefined {
  if (!input.ffmpegConfigured) {
    return "Configure FFmpeg path first";
  }
  if (input.isRunning) {
    return "A compression batch is already running";
  }
  if (input.isStarting) {
    return "Starting…";
  }
  return undefined;
}

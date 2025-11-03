import { vi } from 'vitest';

/**
 * Get the mocked wrapTauriInvoke function for configuring test behavior
 *
 * Call this in beforeEach or test setup to get access to the mock.
 * Must be used in conjunction with the manual mock setup in the test file.
 *
 * @example
 * ```typescript
 * import { getMockTauriInvoke } from './testUtils';
 *
 * // At module level - REQUIRED for mocking to work:
 * vi.mock('./tauriInvokeWrapper');
 *
 * describe('MyService', () => {
 *   let mockInvoke: ReturnType<typeof vi.fn>;
 *
 *   beforeEach(async () => {
 *     mockInvoke = await getMockTauriInvoke();
 *     vi.clearAllMocks();
 *   });
 *
 *   it('should call backend', async () => {
 *     mockInvoke.mockResolvedValue({ data: 'test' });
 *     // ... test code
 *   });
 * });
 * ```
 */
export async function getMockTauriInvoke() {
  const { wrapTauriInvoke } = await import('./tauriInvokeWrapper');
  return wrapTauriInvoke as ReturnType<typeof vi.fn>;
}

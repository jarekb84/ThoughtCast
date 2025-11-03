/**
 * Standard error type for all API operations
 *
 * Provides consistent error handling across the abstraction layer,
 * preserving original error information while adding context.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly originalError?: unknown,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage(): string {
    if (this.originalError instanceof Error) {
      return `${this.message}: ${this.originalError.message}`;
    }
    return this.message;
  }

  /**
   * Get detailed error information for logging
   */
  getDetails(): string {
    return JSON.stringify({
      message: this.message,
      code: this.code,
      originalError: this.originalError instanceof Error
        ? this.originalError.message
        : String(this.originalError)
    }, null, 2);
  }
}

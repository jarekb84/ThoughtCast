import { describe, it, expect } from 'vitest';
import { ApiError } from './ApiError';

describe('ApiError', () => {
  describe('constructor', () => {
    it('should create error with message', () => {
      const error = new ApiError('Test error message');

      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('ApiError');
    });

    it('should store original error', () => {
      const originalError = new Error('Original error');
      const error = new ApiError('Wrapped error', originalError);

      expect(error.originalError).toBe(originalError);
    });

    it('should store error code', () => {
      const error = new ApiError('Test error', undefined, 'TEST_ERROR_CODE');

      expect(error.code).toBe('TEST_ERROR_CODE');
    });

    it('should be instanceof ApiError', () => {
      const error = new ApiError('Test');

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('getUserMessage', () => {
    it('should return simple message when no original error', () => {
      const error = new ApiError('Simple error');

      expect(error.getUserMessage()).toBe('Simple error');
    });

    it('should combine messages when original error is Error', () => {
      const originalError = new Error('Backend connection timeout');
      const error = new ApiError('Failed to load data', originalError);

      expect(error.getUserMessage()).toBe('Failed to load data: Backend connection timeout');
    });

    it('should return simple message when original error is not Error', () => {
      const error = new ApiError('Test error', 'string error');

      expect(error.getUserMessage()).toBe('Test error');
    });
  });

  describe('getDetails', () => {
    it('should return JSON details', () => {
      const error = new ApiError('Test error', undefined, 'TEST_CODE');
      const details = error.getDetails();

      expect(details).toContain('Test error');
      expect(details).toContain('TEST_CODE');
    });

    it('should include original error message in details', () => {
      const originalError = new Error('Original error');
      const error = new ApiError('Wrapped error', originalError, 'ERROR_CODE');
      const details = error.getDetails();

      expect(details).toContain('Wrapped error');
      expect(details).toContain('Original error');
      expect(details).toContain('ERROR_CODE');
    });

    it('should convert non-Error original errors to string', () => {
      const error = new ApiError('Test error', { custom: 'object' });
      const details = error.getDetails();

      expect(details).toContain('Test error');
      expect(details).toContain('[object Object]');
    });

    it('should be valid JSON', () => {
      const error = new ApiError('Test error', new Error('Original'), 'CODE');
      const details = error.getDetails();

      expect(() => JSON.parse(details)).not.toThrow();
    });
  });

  describe('error handling scenarios', () => {
    it('should work in try-catch blocks', () => {
      const thrownError = new ApiError('Test error', undefined, 'TEST_CODE');

      try {
        throw thrownError;
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe('TEST_CODE');
      }
    });

    it('should preserve stack trace', () => {
      const error = new ApiError('Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ApiError');
    });

    it('should work with Promise rejections', async () => {
      const error = new ApiError('Async error', undefined, 'ASYNC_CODE');

      await expect(Promise.reject(error)).rejects.toThrow(ApiError);
      await expect(Promise.reject(error)).rejects.toThrow('Async error');
    });
  });
});

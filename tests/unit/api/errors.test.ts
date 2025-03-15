import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsValidationError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsPermissionError,
  AzureDevOpsRateLimitError,
  isAzureDevOpsError,
  formatAzureDevOpsError
} from '../../../src/common/errors';

describe('Azure DevOps Errors', () => {
  describe('AzureDevOpsError', () => {
    it('should create base error with message', () => {
      const error = new AzureDevOpsError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('AzureDevOpsError');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof AzureDevOpsError).toBe(true);
    });
  });

  describe('AzureDevOpsAuthenticationError', () => {
    it('should create authentication error', () => {
      const error = new AzureDevOpsAuthenticationError('Auth failed');
      expect(error.message).toBe('Auth failed');
      expect(error.name).toBe('AzureDevOpsAuthenticationError');
      expect(error instanceof AzureDevOpsError).toBe(true);
      expect(error instanceof AzureDevOpsAuthenticationError).toBe(true);
    });
  });

  describe('AzureDevOpsValidationError', () => {
    it('should create validation error with response', () => {
      const response = { status: 400, data: { message: 'Invalid input' } };
      const error = new AzureDevOpsValidationError('Validation failed', response);
      expect(error.message).toBe('Validation failed');
      expect(error.name).toBe('AzureDevOpsValidationError');
      expect(error.response).toBe(response);
      expect(error instanceof AzureDevOpsError).toBe(true);
      expect(error instanceof AzureDevOpsValidationError).toBe(true);
    });

    it('should create validation error without response', () => {
      const error = new AzureDevOpsValidationError('Validation failed', undefined);
      expect(error.message).toBe('Validation failed');
      expect(error.response).toBeUndefined();
    });
  });

  describe('AzureDevOpsResourceNotFoundError', () => {
    it('should create not found error', () => {
      const error = new AzureDevOpsResourceNotFoundError('Resource not found');
      expect(error.message).toBe('Resource not found');
      expect(error.name).toBe('AzureDevOpsResourceNotFoundError');
      expect(error instanceof AzureDevOpsError).toBe(true);
      expect(error instanceof AzureDevOpsResourceNotFoundError).toBe(true);
    });
  });

  describe('AzureDevOpsPermissionError', () => {
    it('should create permission error', () => {
      const error = new AzureDevOpsPermissionError('Permission denied');
      expect(error.message).toBe('Permission denied');
      expect(error.name).toBe('AzureDevOpsPermissionError');
      expect(error instanceof AzureDevOpsError).toBe(true);
      expect(error instanceof AzureDevOpsPermissionError).toBe(true);
    });
  });

  describe('AzureDevOpsRateLimitError', () => {
    it('should create rate limit error with reset time', () => {
      const resetAt = new Date();
      const error = new AzureDevOpsRateLimitError('Rate limit exceeded', resetAt);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.name).toBe('AzureDevOpsRateLimitError');
      expect(error.resetAt).toBe(resetAt);
      expect(error instanceof AzureDevOpsError).toBe(true);
      expect(error instanceof AzureDevOpsRateLimitError).toBe(true);
    });

    it('should create rate limit error with default reset time', () => {
      const error = new AzureDevOpsRateLimitError('Rate limit exceeded', new Date(0));
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.resetAt.getTime()).toBe(0);
    });
  });

  describe('isAzureDevOpsError', () => {
    it('should return true for Azure DevOps errors', () => {
      expect(isAzureDevOpsError(new AzureDevOpsError('Test'))).toBe(true);
      expect(isAzureDevOpsError(new AzureDevOpsAuthenticationError('Test'))).toBe(true);
      expect(isAzureDevOpsError(new AzureDevOpsValidationError('Test', undefined))).toBe(true);
      expect(isAzureDevOpsError(new AzureDevOpsResourceNotFoundError('Test'))).toBe(true);
      expect(isAzureDevOpsError(new AzureDevOpsPermissionError('Test'))).toBe(true);
      expect(isAzureDevOpsError(new AzureDevOpsRateLimitError('Test', new Date(0)))).toBe(true);
    });

    it('should return false for non-Azure DevOps errors', () => {
      expect(isAzureDevOpsError(new Error('Test'))).toBe(false);
      expect(isAzureDevOpsError({ message: 'Test' })).toBe(false);
      expect(isAzureDevOpsError(null)).toBe(false);
      expect(isAzureDevOpsError(undefined)).toBe(false);
    });
  });

  describe('formatAzureDevOpsError', () => {
    it('should format Azure DevOps error with name and message', () => {
      const error = new AzureDevOpsError('Test error');
      expect(formatAzureDevOpsError(error)).toBe('AzureDevOpsError: Test error');
    });

    it('should format validation error with response', () => {
      const response = { status: 400, data: { message: 'Invalid input' } };
      const error = new AzureDevOpsValidationError('Validation failed', response);
      expect(formatAzureDevOpsError(error)).toBe(
        'AzureDevOpsValidationError: Validation failed\nResponse: {"status":400,"data":{"message":"Invalid input"}}'
      );
    });

    it('should format validation error with null response', () => {
      const error = new AzureDevOpsValidationError('Validation failed', null);
      expect(formatAzureDevOpsError(error)).toBe('AzureDevOpsValidationError: Validation failed');
    });

    it('should format rate limit error with reset time', () => {
      const resetAt = new Date('2024-01-01T00:00:00Z');
      const error = new AzureDevOpsRateLimitError('Rate limit exceeded', resetAt);
      expect(formatAzureDevOpsError(error)).toBe(
        'AzureDevOpsRateLimitError: Rate limit exceeded\nReset at: 2024-01-01T00:00:00.000Z'
      );
    });

    it('should format non-Azure DevOps error', () => {
      const error = new Error('Regular error');
      expect(formatAzureDevOpsError(error as AzureDevOpsError)).toBe('Error: Regular error');
    });

    it('should handle non-error objects', () => {
      const objError = { name: 'TestError', message: 'Test' } as AzureDevOpsError;
      const strError = 'string error' as unknown as AzureDevOpsError;
      const nullError = null as unknown as AzureDevOpsError;
      const undefinedError = undefined as unknown as AzureDevOpsError;

      expect(formatAzureDevOpsError(objError)).toBe('TestError: Test');
      expect(formatAzureDevOpsError(strError)).toBe('string error');
      expect(formatAzureDevOpsError(nullError)).toBe('null');
      expect(formatAzureDevOpsError(undefinedError)).toBe('undefined');
    });

    it('should handle objects with missing properties', () => {
      const errorWithoutName = { message: 'No name' } as AzureDevOpsError;
      const errorWithoutMessage = { name: 'NoMessage' } as AzureDevOpsError;
      const emptyObject = {} as AzureDevOpsError;

      expect(formatAzureDevOpsError(errorWithoutName)).toBe('Unknown: No name');
      expect(formatAzureDevOpsError(errorWithoutMessage)).toBe('NoMessage: Unknown error');
      expect(formatAzureDevOpsError(emptyObject)).toBe('Unknown: Unknown error');
    });

    it('should handle other primitive types', () => {
      const numberError = 123 as unknown as AzureDevOpsError;
      const booleanError = true as unknown as AzureDevOpsError;

      expect(formatAzureDevOpsError(numberError)).toBe('Unknown: Unknown error');
      expect(formatAzureDevOpsError(booleanError)).toBe('Unknown: Unknown error');
    });
  });
}); 
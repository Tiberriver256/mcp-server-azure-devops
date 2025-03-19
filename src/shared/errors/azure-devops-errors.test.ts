import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsValidationError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsPermissionError,
  AzureDevOpsRateLimitError,
  isAzureDevOpsError,
  formatAzureDevOpsError,
} from './azure-devops-errors';

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
      const error = new AzureDevOpsValidationError(
        'Validation failed',
        response,
      );
      expect(error.message).toBe('Validation failed');
      expect(error.name).toBe('AzureDevOpsValidationError');
      expect(error.response).toBe(response);
      expect(error instanceof AzureDevOpsError).toBe(true);
      expect(error instanceof AzureDevOpsValidationError).toBe(true);
    });

    it('should create validation error without response', () => {
      const error = new AzureDevOpsValidationError(
        'Validation failed',
        undefined,
      );
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
      const resetTime = new Date(Date.now() + 60000); // 1 minute from now
      const error = new AzureDevOpsRateLimitError(
        'Rate limit exceeded',
        resetTime,
      );
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.name).toBe('AzureDevOpsRateLimitError');
      expect(error.resetAt).toBe(resetTime);
      expect(error instanceof AzureDevOpsError).toBe(true);
      expect(error instanceof AzureDevOpsRateLimitError).toBe(true);
    });

    it('should create rate limit error with default reset time', () => {
      const defaultResetAt = new Date(Date.now() + 30000); // Default should be 30 seconds from now

      const error = new AzureDevOpsRateLimitError(
        'Rate limit exceeded',
        defaultResetAt,
      );
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.resetAt).toBeInstanceOf(Date);
      // Should be roughly 30 seconds in the future
      expect(error.resetAt.getTime()).toBeGreaterThan(Date.now());
      expect(error.resetAt.getTime()).toBeLessThan(Date.now() + 60000);
    });
  });

  describe('isAzureDevOpsError', () => {
    it('should return true for Azure DevOps errors', () => {
      expect(isAzureDevOpsError(new AzureDevOpsError('Error'))).toBe(true);
      expect(
        isAzureDevOpsError(new AzureDevOpsAuthenticationError('Auth error')),
      ).toBe(true);
      expect(
        isAzureDevOpsError(new AzureDevOpsValidationError('Validation error')),
      ).toBe(true);
      expect(
        isAzureDevOpsError(new AzureDevOpsResourceNotFoundError('Not found')),
      ).toBe(true);
      expect(
        isAzureDevOpsError(new AzureDevOpsPermissionError('Permission denied')),
      ).toBe(true);
      expect(
        isAzureDevOpsError(
          new AzureDevOpsRateLimitError('Rate limit', new Date()),
        ),
      ).toBe(true);
    });

    it('should return false for non-Azure DevOps errors', () => {
      expect(isAzureDevOpsError(new Error('Generic error'))).toBe(false);
      expect(isAzureDevOpsError('string error')).toBe(false);
      expect(isAzureDevOpsError(null)).toBe(false);
      expect(isAzureDevOpsError(undefined)).toBe(false);
      expect(isAzureDevOpsError(42)).toBe(false);
      expect(isAzureDevOpsError({})).toBe(false);
    });
  });

  describe('formatAzureDevOpsError', () => {
    it('should format Azure DevOps error with name and message', () => {
      const error = new AzureDevOpsError('Test error');
      const formatted = formatAzureDevOpsError(error);
      expect(formatted).toContain('AzureDevOpsError');
      expect(formatted).toContain('Test error');
    });

    it('should format validation error with response', () => {
      const response = { status: 400, data: { message: 'Invalid input' } };
      const error = new AzureDevOpsValidationError(
        'Validation failed',
        response,
      );
      const formatted = formatAzureDevOpsError(error);
      expect(formatted).toContain('AzureDevOpsValidationError');
      expect(formatted).toContain('Validation failed');
      expect(formatted).toContain('400');
      expect(formatted).toContain('Invalid input');
    });

    it('should format validation error with null response', () => {
      const error = new AzureDevOpsValidationError('Validation failed', null);
      const formatted = formatAzureDevOpsError(error);
      expect(formatted).toContain('AzureDevOpsValidationError');
      expect(formatted).toContain('Validation failed');
      expect(formatted).toContain('No response details available');
    });

    it('should format rate limit error with reset time', () => {
      const resetTime = new Date(Date.now() + 60000); // 1 minute from now
      const error = new AzureDevOpsRateLimitError(
        'Rate limit exceeded',
        resetTime,
      );
      const formatted = formatAzureDevOpsError(error);
      expect(formatted).toContain('AzureDevOpsRateLimitError');
      expect(formatted).toContain('Rate limit exceeded');
      expect(formatted).toContain(resetTime.toISOString());
    });

    it('should format non-Azure DevOps error', () => {
      const error = new Error('Generic error');
      const formatted = formatAzureDevOpsError(error);
      expect(formatted).toContain('Error');
      expect(formatted).toContain('Generic error');
    });

    it('should handle non-error objects', () => {
      const formatted = formatAzureDevOpsError('string error');
      expect(formatted).toContain('string error');
    });

    it('should handle objects with missing properties', () => {
      const formatted = formatAzureDevOpsError({});
      expect(formatted).toContain('Unknown error');
    });

    it('should handle other primitive types', () => {
      expect(formatAzureDevOpsError(null)).toContain('null');
      expect(formatAzureDevOpsError(undefined)).toContain('undefined');
      expect(formatAzureDevOpsError(42)).toContain('42');
    });
  });
});

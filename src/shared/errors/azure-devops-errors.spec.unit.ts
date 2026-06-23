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

describe('Error Classes', () => {
  describe('AzureDevOpsError', () => {
    it('should set name and message', () => {
      const error = new AzureDevOpsError('base error');
      expect(error.name).toBe('AzureDevOpsError');
      expect(error.message).toBe('base error');
      expect(error).toBeInstanceOf(Error);
    });

    it('should support cause option', () => {
      const cause = new Error('root cause');
      const error = new AzureDevOpsError('wrapper', { cause });
      expect(error.cause).toBe(cause);
    });
  });

  describe('AzureDevOpsAuthenticationError', () => {
    it('should set name and be instanceof AzureDevOpsError', () => {
      const error = new AzureDevOpsAuthenticationError('auth failed');
      expect(error.name).toBe('AzureDevOpsAuthenticationError');
      expect(error).toBeInstanceOf(AzureDevOpsError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('AzureDevOpsValidationError', () => {
    it('should set name and response', () => {
      const response = { message: 'invalid field', statusCode: 400 };
      const error = new AzureDevOpsValidationError('bad input', response);
      expect(error.name).toBe('AzureDevOpsValidationError');
      expect(error.response).toBe(response);
      expect(error).toBeInstanceOf(AzureDevOpsError);
    });

    it('should handle missing response', () => {
      const error = new AzureDevOpsValidationError('bad input');
      expect(error.response).toBeUndefined();
    });

    it('should support cause option', () => {
      const cause = new Error('original');
      const error = new AzureDevOpsValidationError('bad', undefined, { cause });
      expect(error.cause).toBe(cause);
    });
  });

  describe('AzureDevOpsResourceNotFoundError', () => {
    it('should set name', () => {
      const error = new AzureDevOpsResourceNotFoundError('not found');
      expect(error.name).toBe('AzureDevOpsResourceNotFoundError');
      expect(error).toBeInstanceOf(AzureDevOpsError);
    });
  });

  describe('AzureDevOpsPermissionError', () => {
    it('should set name', () => {
      const error = new AzureDevOpsPermissionError('no access');
      expect(error.name).toBe('AzureDevOpsPermissionError');
      expect(error).toBeInstanceOf(AzureDevOpsError);
    });
  });

  describe('AzureDevOpsRateLimitError', () => {
    it('should set name and resetAt', () => {
      const resetAt = new Date('2025-01-01T00:00:00Z');
      const error = new AzureDevOpsRateLimitError('rate limited', resetAt);
      expect(error.name).toBe('AzureDevOpsRateLimitError');
      expect(error.resetAt).toBe(resetAt);
      expect(error).toBeInstanceOf(AzureDevOpsError);
    });

    it('should support cause option', () => {
      const resetAt = new Date();
      const cause = new Error('original');
      const error = new AzureDevOpsRateLimitError('limited', resetAt, {
        cause,
      });
      expect(error.cause).toBe(cause);
    });
  });
});

describe('isAzureDevOpsError', () => {
  it('should return true for AzureDevOpsError', () => {
    expect(isAzureDevOpsError(new AzureDevOpsError('test'))).toBe(true);
  });

  it('should return true for subclasses', () => {
    expect(isAzureDevOpsError(new AzureDevOpsAuthenticationError('test'))).toBe(
      true,
    );
    expect(isAzureDevOpsError(new AzureDevOpsValidationError('test'))).toBe(
      true,
    );
    expect(
      isAzureDevOpsError(new AzureDevOpsResourceNotFoundError('test')),
    ).toBe(true);
    expect(isAzureDevOpsError(new AzureDevOpsPermissionError('test'))).toBe(
      true,
    );
    expect(
      isAzureDevOpsError(new AzureDevOpsRateLimitError('test', new Date())),
    ).toBe(true);
  });

  it('should return false for standard Error', () => {
    expect(isAzureDevOpsError(new Error('test'))).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isAzureDevOpsError('string')).toBe(false);
    expect(isAzureDevOpsError(42)).toBe(false);
    expect(isAzureDevOpsError(null)).toBe(false);
    expect(isAzureDevOpsError(undefined)).toBe(false);
    expect(isAzureDevOpsError({})).toBe(false);
  });
});

describe('formatAzureDevOpsError', () => {
  it('should format null', () => {
    expect(formatAzureDevOpsError(null)).toBe('null');
  });

  it('should format undefined', () => {
    expect(formatAzureDevOpsError(undefined)).toBe('undefined');
  });

  it('should format string', () => {
    expect(formatAzureDevOpsError('some error')).toBe('some error');
  });

  it('should format number', () => {
    expect(formatAzureDevOpsError(42)).toBe('42');
  });

  it('should format boolean', () => {
    expect(formatAzureDevOpsError(true)).toBe('true');
    expect(formatAzureDevOpsError(false)).toBe('false');
  });

  it('should format AzureDevOpsError with name and message', () => {
    const error = new AzureDevOpsError('something failed');
    const result = formatAzureDevOpsError(error);
    expect(result).toBe('AzureDevOpsError: something failed');
  });

  it('should format AzureDevOpsValidationError with response', () => {
    const response = { message: 'invalid', statusCode: 400 };
    const error = new AzureDevOpsValidationError('bad input', response);
    const result = formatAzureDevOpsError(error);
    expect(result).toContain('AzureDevOpsValidationError: bad input');
    expect(result).toContain('Response:');
    expect(result).toContain('"statusCode":400');
  });

  it('should format AzureDevOpsValidationError without response', () => {
    const error = new AzureDevOpsValidationError('bad input');
    const result = formatAzureDevOpsError(error);
    expect(result).toContain('No response details available');
  });

  it('should format AzureDevOpsRateLimitError with resetAt', () => {
    const resetAt = new Date('2025-06-01T12:00:00Z');
    const error = new AzureDevOpsRateLimitError('rate limited', resetAt);
    const result = formatAzureDevOpsError(error);
    expect(result).toContain('AzureDevOpsRateLimitError: rate limited');
    expect(result).toContain('Reset at: 2025-06-01T12:00:00.000Z');
  });

  it('should format a generic error-like object', () => {
    const error = { name: 'CustomError', message: 'custom message' };
    const result = formatAzureDevOpsError(error);
    expect(result).toBe('CustomError: custom message');
  });

  it('should handle error-like object without name or message', () => {
    const result = formatAzureDevOpsError({});
    expect(result).toBe('Unknown: Unknown error');
  });
});

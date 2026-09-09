import { AxiosError, AxiosHeaders } from 'axios';
import {
  handleRequestError,
  handleResponseError,
} from './handle-request-error';
import {
  AzureDevOpsError,
  AzureDevOpsValidationError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsPermissionError,
} from './azure-devops-errors';

function makeAxiosError(
  status: number,
  data?: { message?: string },
  message = 'Request failed',
): AxiosError {
  const error = new AxiosError(
    message,
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status,
      data: data ?? {},
      statusText: 'Error',
      headers: {},
      config: { headers: new AxiosHeaders() },
    } as any,
  );
  return error;
}

describe('handleRequestError', () => {
  it('should rethrow AzureDevOpsError as-is', () => {
    const original = new AzureDevOpsError('original');
    expect(() => handleRequestError(original, 'testing')).toThrow(original);
  });

  it('should rethrow AzureDevOpsValidationError as-is', () => {
    const original = new AzureDevOpsValidationError('bad input');
    expect(() => handleRequestError(original, 'testing')).toThrow(original);
  });

  it('should rethrow AzureDevOpsResourceNotFoundError as-is', () => {
    const original = new AzureDevOpsResourceNotFoundError('not found');
    expect(() => handleRequestError(original, 'testing')).toThrow(original);
  });

  it('should rethrow AzureDevOpsAuthenticationError as-is', () => {
    const original = new AzureDevOpsAuthenticationError('auth fail');
    expect(() => handleRequestError(original, 'testing')).toThrow(original);
  });

  it('should rethrow AzureDevOpsPermissionError as-is', () => {
    const original = new AzureDevOpsPermissionError('no perms');
    expect(() => handleRequestError(original, 'testing')).toThrow(original);
  });

  describe('Axios errors', () => {
    it('should throw AzureDevOpsValidationError for 400 status', () => {
      const axiosError = makeAxiosError(400, {
        message: 'Bad request body',
      });
      expect(() =>
        handleRequestError(axiosError, 'creating work item'),
      ).toThrow(AzureDevOpsValidationError);
      expect(() =>
        handleRequestError(axiosError, 'creating work item'),
      ).toThrow('Invalid request while creating work item: Bad request body');
    });

    it('should throw AzureDevOpsAuthenticationError for 401 status', () => {
      const axiosError = makeAxiosError(401, {
        message: 'Token expired',
      });
      expect(() => handleRequestError(axiosError, 'fetching data')).toThrow(
        AzureDevOpsAuthenticationError,
      );
      expect(() => handleRequestError(axiosError, 'fetching data')).toThrow(
        'Authentication failed while fetching data: Token expired',
      );
    });

    it('should throw AzureDevOpsPermissionError for 403 status', () => {
      const axiosError = makeAxiosError(403, {
        message: 'Insufficient scope',
      });
      expect(() => handleRequestError(axiosError, 'updating item')).toThrow(
        AzureDevOpsPermissionError,
      );
      expect(() => handleRequestError(axiosError, 'updating item')).toThrow(
        'Permission denied while updating item: Insufficient scope',
      );
    });

    it('should throw AzureDevOpsResourceNotFoundError for 404 status', () => {
      const axiosError = makeAxiosError(404, {
        message: 'Resource does not exist',
      });
      expect(() => handleRequestError(axiosError, 'getting repo')).toThrow(
        AzureDevOpsResourceNotFoundError,
      );
      expect(() => handleRequestError(axiosError, 'getting repo')).toThrow(
        'Resource not found while getting repo: Resource does not exist',
      );
    });

    it('should throw generic AzureDevOpsError for other status codes', () => {
      const axiosError = makeAxiosError(500, {
        message: 'Internal server error',
      });
      expect(() => handleRequestError(axiosError, 'processing')).toThrow(
        AzureDevOpsError,
      );
      expect(() => handleRequestError(axiosError, 'processing')).toThrow(
        'Failed while processing: Internal server error',
      );
    });

    it('should fall back to axiosError.message when response data has no message', () => {
      const axiosError = makeAxiosError(500, {});
      expect(() => handleRequestError(axiosError, 'doing stuff')).toThrow(
        'Failed while doing stuff: Request failed',
      );
    });
  });

  describe('non-Axios, non-AzureDevOps errors', () => {
    it('should wrap a standard Error', () => {
      const error = new Error('Something broke');
      expect(() => handleRequestError(error, 'performing operation')).toThrow(
        AzureDevOpsError,
      );
      expect(() => handleRequestError(error, 'performing operation')).toThrow(
        'Unexpected error while performing operation: Something broke',
      );
    });

    it('should handle string errors', () => {
      expect(() => handleRequestError('string error', 'processing')).toThrow(
        AzureDevOpsError,
      );
      expect(() => handleRequestError('string error', 'processing')).toThrow(
        'Unexpected error while processing: string error',
      );
    });

    it('should handle number errors', () => {
      expect(() => handleRequestError(42, 'computing')).toThrow(
        'Unexpected error while computing: 42',
      );
    });

    it('should handle null errors', () => {
      expect(() => handleRequestError(null, 'doing')).toThrow(
        'Unexpected error while doing: null',
      );
    });
  });
});

describe('handleResponseError', () => {
  it('should format AzureDevOpsValidationError', () => {
    const error = new AzureDevOpsValidationError('bad field');
    const result = handleResponseError(error);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('Validation Error: bad field');
  });

  it('should format AzureDevOpsResourceNotFoundError', () => {
    const error = new AzureDevOpsResourceNotFoundError('item missing');
    const result = handleResponseError(error);

    expect(result.content[0].text).toBe('Not Found: item missing');
  });

  it('should format AzureDevOpsAuthenticationError', () => {
    const error = new AzureDevOpsAuthenticationError('bad token');
    const result = handleResponseError(error);

    expect(result.content[0].text).toBe('Authentication Failed: bad token');
  });

  it('should format AzureDevOpsPermissionError', () => {
    const error = new AzureDevOpsPermissionError('no access');
    const result = handleResponseError(error);

    expect(result.content[0].text).toBe('Permission Denied: no access');
  });

  it('should format generic AzureDevOpsError', () => {
    const error = new AzureDevOpsError('something went wrong');
    const result = handleResponseError(error);

    expect(result.content[0].text).toBe(
      'Azure DevOps API Error: something went wrong',
    );
  });

  it('should format non-AzureDevOps Error', () => {
    const error = new Error('generic error');
    const result = handleResponseError(error);

    expect(result.content[0].text).toBe('Error: generic error');
  });

  it('should format non-Error objects', () => {
    const result = handleResponseError('string error');

    expect(result.content[0].text).toBe('Error: string error');
  });

  it('should handle non-Error non-string values', () => {
    const result = handleResponseError(123);

    expect(result.content[0].text).toBe('Error: 123');
  });
});

import axios from 'axios';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsPermissionError,
} from '../../shared/errors';

try {
  // ... existing code ...
} catch (error: unknown) {
  if (error instanceof AzureDevOpsError) {
    throw error;
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 404) {
      throw new AzureDevOpsResourceNotFoundError(
        'Pull request or repository not found',
        { cause: error },
      );
    }
    if (status === 400) {
      throw new AzureDevOpsValidationError(
        'Invalid pull request parameters',
        error.response?.data,
        { cause: error },
      );
    }
    if (status === 401) {
      throw new AzureDevOpsAuthenticationError('Authentication failed', {
        cause: error,
      });
    }
    if (status === 403) {
      throw new AzureDevOpsPermissionError(
        'Permission denied to access pull request',
        { cause: error },
      );
    }
  }

  throw new AzureDevOpsError('Failed to process pull request operation', {
    cause: error,
  });
}

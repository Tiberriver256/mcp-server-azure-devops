import {
  AzureDevOpsError,
  AzureDevOpsValidationError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsPermissionError,
  ApiErrorResponse,
  isAzureDevOpsError,
} from './azure-devops-errors';
import axios, { AxiosError } from 'axios';

// Create a safe console logging function that won't interfere with MCP protocol
function safeLog(message: string) {
  process.stderr.write(`${message}\n`);
}

/**
 * Format an Azure DevOps error for display
 *
 * @param error The error to format
 * @returns Formatted error message
 */
function formatAzureDevOpsError(error: AzureDevOpsError): string {
  let message = `Azure DevOps API Error: ${error.message}`;

  if (error instanceof AzureDevOpsValidationError) {
    message = `Validation Error: ${error.message}`;
  } else if (error instanceof AzureDevOpsResourceNotFoundError) {
    message = `Not Found: ${error.message}`;
  } else if (error instanceof AzureDevOpsAuthenticationError) {
    message = `Authentication Failed: ${error.message}`;
  } else if (error instanceof AzureDevOpsPermissionError) {
    message = `Permission Denied: ${error.message}`;
  }

  return message;
}

/**
 * Centralized error handler for Azure DevOps API requests.
 * This function takes an error caught in a try-catch block and converts it
 * into an appropriate AzureDevOpsError subtype with a user-friendly message.
 *
 * @param error - The caught error to handle
 * @param context - Additional context about the operation being performed
 * @returns Never - This function always throws an error
 * @throws {AzureDevOpsError} - Always throws a subclass of AzureDevOpsError
 *
 * @example
 * try {
 *   // Some Azure DevOps API call
 * } catch (error) {
 *   handleRequestError(error, 'getting work item details');
 * }
 */
export function handleRequestError(error: unknown, context: string): never {
  // If it's already an AzureDevOpsError, rethrow it
  if (error instanceof AzureDevOpsError) {
    throw error;
  }

  // Handle Axios errors
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorResponse>;
    const status = axiosError.response?.status;
    const data = axiosError.response?.data;
    const message = data?.message || axiosError.message;

    switch (status) {
      case 400:
        throw new AzureDevOpsValidationError(
          `Invalid request while ${context}: ${message}`,
          data,
          { cause: error },
        );

      case 401:
        throw new AzureDevOpsAuthenticationError(
          `Authentication failed while ${context}: ${message}`,
          { cause: error },
        );

      case 403:
        throw new AzureDevOpsPermissionError(
          `Permission denied while ${context}: ${message}`,
          { cause: error },
        );

      case 404:
        throw new AzureDevOpsResourceNotFoundError(
          `Resource not found while ${context}: ${message}`,
          { cause: error },
        );

      default:
        throw new AzureDevOpsError(`Failed while ${context}: ${message}`, {
          cause: error,
        });
    }
  }

  // Handle all other errors
  throw new AzureDevOpsError(
    `Unexpected error while ${context}: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  );
}

/**
 * Handles errors from feature request handlers and returns a formatted response
 * instead of throwing an error. This is used in the server's request handlers.
 *
 * @param error The error to handle
 * @returns A formatted error response
 */
export function handleResponseError(error: unknown): {
  content: Array<{ type: string; text: string }>;
} {
  safeLog(`Error handling request: ${error}`);

  const errorMessage = isAzureDevOpsError(error)
    ? formatAzureDevOpsError(error)
    : `Error: ${error instanceof Error ? error.message : String(error)}`;

  return {
    content: [{ type: 'text', text: errorMessage }],
  };
}

import type { AzureDevOpsError } from './azure-devops-errors';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsPermissionError,
  AzureDevOpsRateLimitError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
  isAzureDevOpsError,
} from './azure-devops-errors';
import { mapHttpErrorToAzureDevOpsError } from '../http/http-client';
import { logError } from '../logging';

/**
 * Scrub Authorization header values and URL-embedded credentials from any
 * error message or stack trace before emitting to stderr or MCP tool output.
 */
export function redactSecrets(input: string): string {
  return input
    .replace(
      /(authorization["']?\s*[:=]\s*["']?(?:basic|bearer)\s+)[^\s"',;}\])]+/gi,
      '$1[REDACTED]',
    )
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9+/=._-]{8,}/gi, '$1 [REDACTED]')
    .replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[REDACTED]@');
}

/**
 * Format an Azure DevOps error into a consistent user-facing message.
 */
export function formatErrorForMcpResponse(error: AzureDevOpsError): string {
  const safeMessage = redactSecrets(error.message);

  if (error instanceof AzureDevOpsValidationError) {
    return `Validation Error: ${safeMessage}`;
  }
  if (error instanceof AzureDevOpsResourceNotFoundError) {
    return `Not Found: ${safeMessage}`;
  }
  if (error instanceof AzureDevOpsAuthenticationError) {
    return `Authentication Failed: ${safeMessage}`;
  }
  if (error instanceof AzureDevOpsPermissionError) {
    return `Permission Denied: ${safeMessage}`;
  }
  if (error instanceof AzureDevOpsRateLimitError) {
    return `Rate Limit Exceeded: ${safeMessage} (resets at ${error.resetAt.toISOString()})`;
  }

  return `Azure DevOps API Error: ${safeMessage}`;
}

/**
 * Centralized error handler for Azure DevOps API requests.
 * Converts HttpError and unknown errors into typed AzureDevOpsError subtypes.
 */
export function handleRequestError(error: unknown, context: string): never {
  throw mapHttpErrorToAzureDevOpsError(error, context);
}

const LOCATION_HINT =
  'Hint: Check AZURE_DEVOPS_ORG_URL shape (e.g. https://dev.azure.com/<org>) and that the organization is reachable.';

function looksLikeLocationLookupFailure(text: string): boolean {
  return (
    text.includes('Failed to find api location') ||
    text.includes('Failed to resolve Azure DevOps API location')
  );
}

/**
 * Handles errors from feature request handlers and returns a formatted MCP
 * error response with secret redaction applied to both logs and response text.
 */
export function handleResponseError(error: unknown): {
  content: Array<{ type: string; text: string }>;
  isError: true;
} {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const safeMessage = redactSecrets(rawMessage);
  const rawCause =
    error instanceof Error && 'cause' in error && error.cause !== undefined
      ? error.cause instanceof Error
        ? error.cause.message
        : String(error.cause)
      : undefined;
  const safeCause = rawCause ? redactSecrets(rawCause) : undefined;
  const safeStack =
    error instanceof Error && error.stack
      ? redactSecrets(error.stack)
      : undefined;

  logError(`Error handling request: ${safeMessage}`);
  if (safeCause) {
    logError(`Cause: ${safeCause}`);
  }
  if (safeStack) {
    logError(safeStack);
  }

  let errorMessage = isAzureDevOpsError(error)
    ? formatErrorForMcpResponse(error)
    : `Error: ${safeMessage}`;

  if (
    looksLikeLocationLookupFailure(safeMessage) ||
    looksLikeLocationLookupFailure(errorMessage)
  ) {
    errorMessage = `${errorMessage}\n${LOCATION_HINT}`;
  }

  return {
    content: [{ type: 'text', text: errorMessage }],
    isError: true,
  };
}

import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors/index.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  if (typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  if (isRecord(error.response) && typeof error.response.status === 'number') {
    return error.response.status;
  }
  return undefined;
}

function extractDetailMessage(error: unknown): string {
  const baseMessage = error instanceof Error ? error.message : String(error);
  if (isRecord(error) && isRecord(error.result)) {
    const resultMsg = error.result.message;
    if (
      typeof resultMsg === 'string' &&
      resultMsg.trim().length > 0 &&
      !baseMessage.includes(resultMsg)
    ) {
      return baseMessage ? `${baseMessage} (${resultMsg})` : resultMsg;
    }
  }
  return baseMessage;
}

/**
 * Convert SDK / REST errors thrown by WorkApi or WorkItemTrackingApi into
 * typed AzureDevOpsError subclasses without attaching raw SDK errors to cause.
 */
export function mapWorkApiError(error: unknown, context: string): never {
  if (error instanceof AzureDevOpsError) {
    throw error;
  }

  const statusCode = extractStatusCode(error);
  const message = extractDetailMessage(error);

  switch (statusCode) {
    case 400:
      throw new AzureDevOpsValidationError(
        `Invalid request while ${context}: ${message}`,
      );
    case 203:
    case 401:
      throw new AzureDevOpsAuthenticationError(
        `Authentication failed while ${context}: ${message}`,
      );
    case 403:
      throw new AzureDevOpsPermissionError(
        `Permission denied while ${context}: ${message}`,
      );
    case 404:
      throw new AzureDevOpsResourceNotFoundError(
        `Resource not found while ${context}: ${message}`,
      );
    default:
      throw new AzureDevOpsError(`Failed while ${context}: ${message}`);
  }
}

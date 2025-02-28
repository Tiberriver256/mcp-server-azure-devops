/**
 * Base error class for Azure DevOps API errors.
 * All specific Azure DevOps errors should extend this class.
 * 
 * @class AzureDevOpsError
 * @extends {Error}
 */
export class AzureDevOpsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AzureDevOpsError';
  }
}

/**
 * Error thrown when authentication with Azure DevOps fails.
 * This can occur due to invalid credentials, expired tokens, or network issues.
 * 
 * @class AzureDevOpsAuthenticationError
 * @extends {AzureDevOpsError}
 */
export class AzureDevOpsAuthenticationError extends AzureDevOpsError {
  constructor(message: string) {
    super(message);
    this.name = 'AzureDevOpsAuthenticationError';
  }
}

/**
 * Error thrown when input validation fails.
 * This includes invalid parameters, malformed requests, or missing required fields.
 * 
 * @class AzureDevOpsValidationError
 * @extends {AzureDevOpsError}
 * @property {any} [response] - The raw response from the API containing validation details
 */
export class AzureDevOpsValidationError extends AzureDevOpsError {
  response?: any;

  constructor(message: string, response?: any) {
    super(message);
    this.name = 'AzureDevOpsValidationError';
    this.response = response;
  }
}

/**
 * Error thrown when a requested resource is not found.
 * This can occur when trying to access non-existent projects, repositories, or work items.
 * 
 * @class AzureDevOpsResourceNotFoundError
 * @extends {AzureDevOpsError}
 */
export class AzureDevOpsResourceNotFoundError extends AzureDevOpsError {
  constructor(message: string) {
    super(message);
    this.name = 'AzureDevOpsResourceNotFoundError';
  }
}

/**
 * Error thrown when the user lacks permissions for an operation.
 * This occurs when trying to access or modify resources without proper authorization.
 * 
 * @class AzureDevOpsPermissionError
 * @extends {AzureDevOpsError}
 */
export class AzureDevOpsPermissionError extends AzureDevOpsError {
  constructor(message: string) {
    super(message);
    this.name = 'AzureDevOpsPermissionError';
  }
}

/**
 * Error thrown when the API rate limit is exceeded.
 * Contains information about when the rate limit will reset.
 * 
 * @class AzureDevOpsRateLimitError
 * @extends {AzureDevOpsError}
 * @property {Date} resetAt - The time when the rate limit will reset
 */
export class AzureDevOpsRateLimitError extends AzureDevOpsError {
  resetAt: Date;

  constructor(message: string, resetAt: Date) {
    super(message);
    this.name = 'AzureDevOpsRateLimitError';
    this.resetAt = resetAt;
  }
}

/**
 * Helper function to check if an error is an Azure DevOps error.
 * Useful for type narrowing in catch blocks.
 * 
 * @param {any} error - The error to check
 * @returns {boolean} True if the error is an Azure DevOps error
 * 
 * @example
 * try {
 *   // Some Azure DevOps operation
 * } catch (error) {
 *   if (isAzureDevOpsError(error)) {
 *     // Handle Azure DevOps specific error
 *   } else {
 *     // Handle other errors
 *   }
 * }
 */
export function isAzureDevOpsError(error: any): error is AzureDevOpsError {
  return error instanceof AzureDevOpsError;
}

/**
 * Format an Azure DevOps error for display.
 * Provides a consistent error message format across different error types.
 * 
 * @param {any} error - The error to format
 * @returns {string} A formatted error message
 * 
 * @example
 * try {
 *   // Some Azure DevOps operation
 * } catch (error) {
 *   console.error(formatAzureDevOpsError(error));
 * }
 */
export function formatAzureDevOpsError(error: any): string {
  // Handle non-error objects
  if (error === null) {
    return 'null';
  }
  
  if (error === undefined) {
    return 'undefined';
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  // Handle error-like objects
  let message = `${error.name || 'Unknown'}: ${error.message || 'Unknown error'}`;
  
  if (error instanceof AzureDevOpsValidationError && error.response) {
    message += `\nResponse: ${JSON.stringify(error.response)}`;
  } else if (error instanceof AzureDevOpsRateLimitError) {
    message += `\nReset at: ${error.resetAt.toISOString()}`;
  }

  return message;
} 
import type { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import {
  PIPELINES_UNSUPPORTED_ERROR_MESSAGE,
  isUnsupportedPipelinesLocationError,
} from '../api-version.ts';
import type { ListPipelinesOptions, Pipeline } from '../types.ts';

/**
 * List pipelines in a project
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for listing pipelines
 * @returns List of pipelines
 */
export async function listPipelines(
  connection: WebApi,
  options: ListPipelinesOptions,
): Promise<Pipeline[]> {
  try {
    const pipelinesApi = await connection.getPipelinesApi();
    const { projectId, orderBy, top, continuationToken } = options;

    // Call the pipelines API to get the list of pipelines
    const pipelines = await pipelinesApi.listPipelines(
      projectId,
      orderBy,
      top,
      continuationToken,
    );

    return pipelines;
  } catch (error) {
    // Handle specific error types
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    if (isUnsupportedPipelinesLocationError(error)) {
      throw new AzureDevOpsValidationError(PIPELINES_UNSUPPORTED_ERROR_MESSAGE);
    }

    // Check for specific error types and convert to appropriate Azure DevOps errors
    if (error instanceof Error) {
      if (
        error.message.includes('Authentication') ||
        error.message.includes('Unauthorized') ||
        error.message.includes('401')
      ) {
        throw new AzureDevOpsAuthenticationError(
          `Failed to authenticate: ${error.message}`,
        );
      }

      if (
        error.message.includes('not found') ||
        error.message.includes('does not exist') ||
        error.message.includes('404')
      ) {
        throw new AzureDevOpsResourceNotFoundError(
          `Project or resource not found: ${error.message}`,
        );
      }
    }

    // Otherwise, wrap it in a generic error
    throw new AzureDevOpsError(
      `Failed to list pipelines: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

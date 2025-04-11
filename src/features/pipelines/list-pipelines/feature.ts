import { WebApi } from 'azure-devops-node-api';
import { Pipeline as ApiPipeline } from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { ListPipelinesOptions, Pipeline } from '../types';

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
    const apiPipelines = await pipelinesApi.listPipelines(
      projectId,
      orderBy,
      top,
      continuationToken,
    );

    // Convert API Pipeline objects to our Pipeline type
    const pipelines: Pipeline[] = apiPipelines.map((pipeline: ApiPipeline) => ({
      id: pipeline.id || 0,
      name: pipeline.name || '',
      folder: pipeline.folder || '',
      revision: pipeline.revision || 0,
      url: pipeline.url || '',
    }));

    return pipelines;
  } catch (error) {
    // Handle specific error types
    if (error instanceof AzureDevOpsError) {
      throw error;
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

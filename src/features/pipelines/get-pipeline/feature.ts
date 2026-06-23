import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { GetPipelineOptions, Pipeline } from '../types';

/**
 * Get a specific pipeline by ID
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for getting a pipeline
 * @returns Pipeline details
 */
export async function getPipeline(
  connection: WebApi,
  options: GetPipelineOptions,
): Promise<Pipeline> {
  try {
    const pipelinesApi = await connection.getPipelinesApi();
    const { projectId, pipelineId, pipelineVersion } = options;

    // Call the pipelines API to get the pipeline
    const pipeline = await pipelinesApi.getPipeline(
      projectId,
      pipelineId,
      pipelineVersion,
    );

    // If pipeline not found, API returns null instead of throwing error
    if (pipeline === null) {
      throw new AzureDevOpsResourceNotFoundError(
        `Pipeline not found with ID: ${pipelineId}`,
      );
    }

    return pipeline;
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
          `Pipeline or project not found: ${error.message}`,
        );
      }
    }

    // Otherwise, wrap it in a generic error
    throw new AzureDevOpsError(
      `Failed to get pipeline: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { defaultProject } from '../../../utils/environment';
import { GetPipelineRunOptions } from '../types';
import { Run } from 'azure-devops-node-api/interfaces/PipelinesInterfaces';

/**
 * Get details of a specific pipeline run
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for getting a pipeline run
 * @returns The run details
 */
export async function getPipelineRun(
  connection: WebApi,
  options: GetPipelineRunOptions,
): Promise<Run> {
  try {
    const pipelinesApi = await connection.getPipelinesApi();
    const { projectId = defaultProject, pipelineId, runId } = options;

    // Call pipeline API to get run details
    const run = await pipelinesApi.getRun(projectId, pipelineId, runId);

    return run;
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
          `Pipeline run not found: ${error.message}`,
        );
      }
    }

    // Otherwise, wrap it in a generic error
    throw new AzureDevOpsError(
      `Failed to get pipeline run: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

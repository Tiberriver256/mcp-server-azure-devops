import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { defaultProject } from '../../../utils/environment';
import { ListPipelineRunsOptions } from '../types';
import { Run } from 'azure-devops-node-api/interfaces/PipelinesInterfaces';

/**
 * List runs for a specific pipeline
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for listing pipeline runs
 * @returns Array of pipeline runs
 */
export async function listPipelineRuns(
  connection: WebApi,
  options: ListPipelineRunsOptions,
): Promise<Run[]> {
  try {
    const pipelinesApi = await connection.getPipelinesApi();
    const { projectId = defaultProject, pipelineId, top = 50 } = options;

    // Call pipeline API to list runs
    const runs = await pipelinesApi.listRuns(projectId, pipelineId);

    // Apply client-side limiting
    const limitedRuns = runs ? runs.slice(0, top) : [];

    return limitedRuns;
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
      `Failed to list pipeline runs: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

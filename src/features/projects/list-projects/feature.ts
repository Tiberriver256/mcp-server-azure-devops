import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsError } from '../../../shared/errors';
import { ListProjectsOptions, TeamProject } from '../types';

/**
 * List all projects in the organization
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Optional parameters for listing projects
 * @returns Array of projects
 */
export async function listProjects(
  connection: WebApi,
  options: ListProjectsOptions = {},
): Promise<TeamProject[]> {
  try {
    const coreApi = await connection.getCoreApi();
    const projects = await coreApi.getProjects(
      options.stateFilter,
      options.top,
      options.skip,
      options.continuationToken,
    );

    return projects;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to list projects: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

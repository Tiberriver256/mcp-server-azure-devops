import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { TeamProject } from '../types';

/**
 * Get a project by ID or name
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @returns The project details
 * @throws {AzureDevOpsResourceNotFoundError} If the project is not found
 */
export async function getProject(
  connection: WebApi,
  projectId: string,
): Promise<TeamProject> {
  try {
    const coreApi = await connection.getCoreApi();
    const project = await coreApi.getProject(projectId);

    if (!project) {
      throw new AzureDevOpsResourceNotFoundError(
        `Project '${projectId}' not found`,
      );
    }

    return project;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get project: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

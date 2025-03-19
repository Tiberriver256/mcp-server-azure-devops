import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { GitRepository } from '../types';

/**
 * Get a repository by ID or name
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param repositoryId The ID or name of the repository
 * @returns The repository details
 * @throws {AzureDevOpsResourceNotFoundError} If the repository is not found
 */
export async function getRepository(
  connection: WebApi,
  projectId: string,
  repositoryId: string,
): Promise<GitRepository> {
  try {
    const gitApi = await connection.getGitApi();
    const repository = await gitApi.getRepository(repositoryId, projectId);

    if (!repository) {
      throw new AzureDevOpsResourceNotFoundError(
        `Repository '${repositoryId}' not found in project '${projectId}'`,
      );
    }

    return repository;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get repository: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

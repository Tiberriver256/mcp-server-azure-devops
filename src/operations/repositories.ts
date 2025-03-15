import { z } from 'zod';
import { WebApi } from 'azure-devops-node-api';
import { GitRepository } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsResourceNotFoundError } from '../common/errors';

/**
 * Schema for getting a repository
 */
export const GetRepositorySchema = z.object({
  projectId: z.string().describe("The ID or name of the project"),
  repositoryId: z.string().describe("The ID or name of the repository")
});

/**
 * Schema for listing repositories
 */
export const ListRepositoriesSchema = z.object({
  projectId: z.string().describe("The ID or name of the project"),
  includeLinks: z.boolean().optional().describe("Whether to include reference links")
});

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
  repositoryId: string
): Promise<GitRepository> {
  try {
    const gitApi = await connection.getGitApi();
    const repository = await gitApi.getRepository(repositoryId, projectId);
    
    if (!repository) {
      throw new AzureDevOpsResourceNotFoundError(`Repository '${repositoryId}' not found in project '${projectId}'`);
    }
    
    return repository;
  } catch (error) {
    if (error instanceof AzureDevOpsResourceNotFoundError) {
      throw error;
    }
    throw new Error(`Failed to get repository: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * List repositories in a project
 * 
 * @param connection The Azure DevOps WebApi connection
 * @param options Parameters for listing repositories
 * @returns Array of repositories
 */
export async function listRepositories(
  connection: WebApi,
  options: z.infer<typeof ListRepositoriesSchema>
): Promise<GitRepository[]> {
  try {
    const gitApi = await connection.getGitApi();
    const repositories = await gitApi.getRepositories(options.projectId, options.includeLinks);
    
    return repositories;
  } catch (error) {
    throw new Error(`Failed to list repositories: ${error instanceof Error ? error.message : String(error)}`);
  }
} 
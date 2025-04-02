import { WebApi } from 'azure-devops-node-api';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { GetRepositoryDetailsOptions, RepositoryDetails } from '../types';

/**
 * Get detailed information about a repository
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for getting repository details
 * @returns The repository details including optional statistics and refs
 * @throws {AzureDevOpsResourceNotFoundError} If the repository is not found
 */
export async function getRepositoryDetails(
  connection: WebApi,
  options: GetRepositoryDetailsOptions,
): Promise<RepositoryDetails> {
  try {
    const gitApi = await connection.getGitApi();

    // Get the basic repository information
    const repository = await gitApi.getRepository(
      options.repositoryId,
      options.projectId,
    );

    if (!repository) {
      throw new AzureDevOpsResourceNotFoundError(
        `Repository '${options.repositoryId}' not found in project '${options.projectId}'`,
      );
    }

    // Initialize the response object
    const response: RepositoryDetails = {
      repository,
    };

    // Get branch statistics if requested
    if (options.includeStatistics) {
      let baseVersionDescriptor = undefined;

      // If a specific branch name is provided, create a version descriptor for it
      if (options.branchName) {
        baseVersionDescriptor = {
          version: options.branchName,
          versionType: GitVersionType.Branch,
        };
      }

      const branchStats = await gitApi.getBranches(
        repository.id || '',
        options.projectId,
        baseVersionDescriptor,
      );

      response.statistics = {
        branches: branchStats || [],
      };
    }

    // Get repository refs if requested
    if (options.includeRefs) {
      const filter = options.refFilter || undefined;
      const refs = await gitApi.getRefs(
        repository.id || '',
        options.projectId,
        filter,
      );

      if (refs) {
        response.refs = {
          value: refs,
          count: refs.length,
        };
      } else {
        response.refs = {
          value: [],
          count: 0,
        };
      }
    }

    return response;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get repository details: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

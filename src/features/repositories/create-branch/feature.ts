import { WebApi } from 'azure-devops-node-api';
import { GitRefUpdate } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import { CreateBranchOptions } from '../types';

/**
 * Create a new branch from an existing one
 */
export async function createBranch(
  connection: WebApi,
  options: CreateBranchOptions,
): Promise<void> {
  try {
    const gitApi = await connection.getGitApi();
    const source = await gitApi.getBranch(
      options.repositoryId,
      options.sourceBranch,
      options.projectId,
    );
    const commitId = source?.commit?.commitId;
    if (!commitId) {
      throw new AzureDevOpsError(
        `Source branch '${options.sourceBranch}' not found`,
      );
    }

    const refUpdate: GitRefUpdate = {
      name: `refs/heads/${options.newBranch}`,
      oldObjectId: '0000000000000000000000000000000000000000',
      newObjectId: commitId,
    };

    const result = await gitApi.updateRefs(
      [refUpdate],
      options.repositoryId,
      options.projectId,
    );
    if (!result.every((r) => r.success)) {
      throw new AzureDevOpsError('Failed to create new branch');
    }
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to create branch: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

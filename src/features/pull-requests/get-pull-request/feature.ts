import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { PullRequest } from '../types';

export async function getPullRequest(
  connection: WebApi,
  options: {
    projectId?: string;
    pullRequestId: number;
  },
): Promise<PullRequest> {
  try {
    const gitApi = await connection.getGitApi();
    const project = options.projectId || undefined;

    const pr = await gitApi.getPullRequestById(options.pullRequestId, project);
    if (!pr) {
      throw new AzureDevOpsResourceNotFoundError(
        `Pull request not found: ${options.pullRequestId}`,
      );
    }

    return pr;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get pull request: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

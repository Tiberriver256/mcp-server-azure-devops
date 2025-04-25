import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsError } from '../../../shared/errors';
import { GetPullRequestCommentsOptions } from '../types';
import { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';

/**
 * Get comments from a pull request
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param repositoryId The ID or name of the repository
 * @param pullRequestId The ID of the pull request
 * @param options Options for filtering comments
 * @returns Array of comment threads with their comments
 */
export async function getPullRequestComments(
  connection: WebApi,
  projectId: string,
  repositoryId: string,
  pullRequestId: number,
  options: GetPullRequestCommentsOptions,
): Promise<GitPullRequestCommentThread[]> {
  try {
    const gitApi = await connection.getGitApi();

    if (options.threadId) {
      // If a specific thread is requested, only return that thread
      const thread = await gitApi.getPullRequestThread(
        repositoryId,
        pullRequestId,
        options.threadId,
        projectId,
      );
      return thread ? [thread] : [];
    } else {
      // Otherwise, get all threads
      const threads = await gitApi.getThreads(
        repositoryId,
        pullRequestId,
        projectId,
        undefined, // iteration
        options.includeDeleted ? 1 : undefined, // Convert boolean to number (1 = include deleted)
      );

      // Return all threads (with pagination if top is specified)
      if (options.top && threads) {
        return threads.slice(0, options.top);
      }
      return threads || [];
    }
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get pull request comments: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

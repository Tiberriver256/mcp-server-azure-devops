import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsError } from '../../../shared/errors';
import { ListPullRequestsOptions, PullRequest } from '../types';
import {
  GitPullRequestSearchCriteria,
  PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces';

/**
 * List pull requests for a repository
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param repositoryId The ID or name of the repository
 * @param options Options for filtering pull requests
 * @returns Object containing pull requests array and pagination metadata
 */
export async function listPullRequests(
  connection: WebApi,
  projectId: string,
  repositoryId: string,
  options: ListPullRequestsOptions,
): Promise<{
  count: number;
  value: PullRequest[];
  hasMoreResults: boolean;
  warning?: string;
}> {
  try {
    const gitApi = await connection.getGitApi();

    // Create search criteria
    const searchCriteria: GitPullRequestSearchCriteria = {};

    // Add filters if provided
    if (options.status) {
      // Map our status enum to Azure DevOps PullRequestStatus
      switch (options.status) {
        case 'active':
          searchCriteria.status = PullRequestStatus.Active;
          break;
        case 'abandoned':
          searchCriteria.status = PullRequestStatus.Abandoned;
          break;
        case 'completed':
          searchCriteria.status = PullRequestStatus.Completed;
          break;
        case 'all':
          // Don't set status to get all
          break;
      }
    }

    if (options.creatorId) {
      searchCriteria.creatorId = options.creatorId;
    }

    if (options.reviewerId) {
      searchCriteria.reviewerId = options.reviewerId;
    }

    if (options.sourceRefName) {
      searchCriteria.sourceRefName = options.sourceRefName;
    }

    if (options.targetRefName) {
      searchCriteria.targetRefName = options.targetRefName;
    }

    // Set default values for pagination
    const top = options.top ?? 10;
    const skip = options.skip ?? 0;

    // List pull requests with search criteria
    const pullRequests = await gitApi.getPullRequests(
      repositoryId,
      searchCriteria,
      projectId,
      undefined, // maxCommentLength
      skip,
      top,
    );

    const results = pullRequests || [];
    const count = results.length;

    // Determine if there are likely more results
    // If we got exactly the number requested, there are probably more
    const hasMoreResults = count === top;

    // Add a warning message if results were truncated
    let warning: string | undefined;
    if (hasMoreResults) {
      warning = `Results limited to ${top} items. Use 'skip: ${skip + top}' to get the next page.`;
    }

    return {
      count,
      value: results,
      hasMoreResults,
      warning,
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to list pull requests: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

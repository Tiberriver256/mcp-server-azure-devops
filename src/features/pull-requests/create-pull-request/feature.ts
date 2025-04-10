import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsError } from '../../../shared/errors';
import { CreatePullRequestOptions, PullRequest } from '../types';

/**
 * Create a pull request
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param repositoryId The ID or name of the repository
 * @param options Options for creating the pull request
 * @returns The created pull request
 */
export async function createPullRequest(
  connection: WebApi,
  projectId: string,
  repositoryId: string,
  options: CreatePullRequestOptions,
): Promise<PullRequest> {
  try {
    if (!options.title) {
      throw new Error('Title is required');
    }

    if (!options.sourceRefName) {
      throw new Error('Source branch is required');
    }

    if (!options.targetRefName) {
      throw new Error('Target branch is required');
    }

    const gitApi = await connection.getGitApi();

    // Create the pull request object
    const pullRequest: PullRequest = {
      title: options.title,
      description: options.description,
      sourceRefName: options.sourceRefName,
      targetRefName: options.targetRefName,
      isDraft: options.isDraft || false,
      workItemRefs: options.workItemRefs?.map((id) => ({
        id: id.toString(),
      })),
      reviewers: options.reviewers?.map((reviewer) => ({
        id: reviewer,
        isRequired: true,
      })),
      ...options.additionalProperties,
    };

    // Create the pull request
    const createdPullRequest = await gitApi.createPullRequest(
      pullRequest,
      repositoryId,
      projectId,
    );

    if (!createdPullRequest) {
      throw new Error('Failed to create pull request');
    }

    return createdPullRequest;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to create pull request: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

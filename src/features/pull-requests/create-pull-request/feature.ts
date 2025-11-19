import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsError } from '../../../shared/errors';
import { CreatePullRequestOptions, PullRequest } from '../types';

function normalizeTags(tags?: string[]): string[] {
  if (!tags) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawTag of tags) {
    const trimmed = rawTag.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

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

    const normalizedTags = normalizeTags(options.tags);

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
    };

    if (options.additionalProperties) {
      Object.assign(pullRequest, options.additionalProperties);
    }

    if (normalizedTags.length > 0) {
      pullRequest.labels = normalizedTags.map((tag) => ({ name: tag }));
    }

    // Create the pull request
    const createdPullRequest = await gitApi.createPullRequest(
      pullRequest,
      repositoryId,
      projectId,
    );

    if (!createdPullRequest) {
      throw new Error('Failed to create pull request');
    }

    if (normalizedTags.length > 0) {
      const pullRequestId = createdPullRequest.pullRequestId;

      if (!pullRequestId) {
        throw new Error('Pull request created without identifier for tagging');
      }

      const existing = new Set(
        (createdPullRequest.labels ?? [])
          .map((label) => label.name?.toLowerCase())
          .filter((name): name is string => Boolean(name)),
      );

      const tagsToCreate = normalizedTags.filter(
        (tag) => !existing.has(tag.toLowerCase()),
      );

      if (tagsToCreate.length > 0) {
        const createdLabels = await Promise.all(
          tagsToCreate.map((tag) =>
            gitApi.createPullRequestLabel(
              { name: tag },
              repositoryId,
              pullRequestId,
              projectId,
            ),
          ),
        );

        createdPullRequest.labels = [
          ...(createdPullRequest.labels ?? []),
          ...createdLabels,
        ];
      }
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

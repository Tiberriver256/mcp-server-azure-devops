import { GitPullRequest } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsClient } from '../../../shared/auth/client-factory';
import { AzureDevOpsError } from '../../../shared/errors';
import { UpdatePullRequestOptions } from '../types';

/**
 * Updates an existing pull request in Azure DevOps with the specified changes.
 *
 * @param options - The options for updating the pull request
 * @returns The updated pull request
 */
export const updatePullRequest = async (
  options: UpdatePullRequestOptions,
): Promise<GitPullRequest> => {
  const {
    projectId,
    repositoryId,
    pullRequestId,
    title,
    description,
    status,
    isDraft,
    addWorkItemIds,
    removeWorkItemIds,
    addReviewers,
    removeReviewers,
    additionalProperties,
  } = options;

  try {
    // Get connection to Azure DevOps
    const client = new AzureDevOpsClient({
      method: (process.env.AZURE_DEVOPS_AUTH_METHOD as any) ?? 'pat',
      organizationUrl: process.env.AZURE_DEVOPS_ORG_URL ?? '',
      personalAccessToken: process.env.AZURE_DEVOPS_PAT,
    });
    const connection = await client.getWebApiClient();

    // Get the Git API client
    const gitApi = await connection.getGitApi();

    // First, get the current pull request
    const pullRequest = await gitApi.getPullRequestById(
      pullRequestId,
      projectId,
    );

    if (!pullRequest) {
      throw new AzureDevOpsError(
        `Pull request ${pullRequestId} not found in repository ${repositoryId}`,
      );
    }

    // Store the artifactId for work item linking
    const artifactId = pullRequest.artifactId;

    // Create an object with the properties to update
    const updateObject: Partial<GitPullRequest> = {};

    if (title !== undefined) {
      updateObject.title = title;
    }

    if (description !== undefined) {
      updateObject.description = description;
    }

    if (isDraft !== undefined) {
      updateObject.isDraft = isDraft;
    }

    if (status) {
      switch (status) {
        case 'active':
          updateObject.status = 1; // GitPullRequestStatus.Active
          break;
        case 'abandoned':
          updateObject.status = 2; // GitPullRequestStatus.Abandoned
          break;
        case 'completed':
          updateObject.status = 3; // GitPullRequestStatus.Completed
          break;
        default:
          throw new AzureDevOpsError(
            `Invalid status: ${status}. Valid values are: active, abandoned, completed`,
          );
      }
    }

    // Add any additional properties that were specified
    if (additionalProperties) {
      Object.assign(updateObject, additionalProperties);
    }

    // Update the pull request
    const updatedPullRequest = await gitApi.updatePullRequest(
      updateObject,
      repositoryId,
      pullRequestId,
      projectId,
    );

    // Handle work items separately if needed
    const addIds = addWorkItemIds ?? [];
    const removeIds = removeWorkItemIds ?? [];
    if (addIds.length > 0 || removeIds.length > 0) {
      await handleWorkItems({
        connection,
        pullRequestId,
        repositoryId,
        projectId,
        workItemIdsToAdd: addIds,
        workItemIdsToRemove: removeIds,
        artifactId,
      });
    }

    // Handle reviewers separately if needed
    const addReviewerIds = addReviewers ?? [];
    const removeReviewerIds = removeReviewers ?? [];
    if (addReviewerIds.length > 0 || removeReviewerIds.length > 0) {
      await handleReviewers({
        connection,
        pullRequestId,
        repositoryId,
        projectId,
        reviewersToAdd: addReviewerIds,
        reviewersToRemove: removeReviewerIds,
      });
    }

    return updatedPullRequest;
  } catch (error) {
    throw new AzureDevOpsError(
      `Failed to update pull request ${pullRequestId} in repository ${repositoryId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Handle adding or removing work items from a pull request
 */
interface WorkItemHandlingOptions {
  connection: any;
  pullRequestId: number;
  repositoryId: string;
  projectId?: string;
  workItemIdsToAdd: number[];
  workItemIdsToRemove: number[];
  artifactId?: string;
}

async function handleWorkItems(
  options: WorkItemHandlingOptions,
): Promise<void> {
  const {
    connection,
    pullRequestId,
    repositoryId,
    projectId,
    workItemIdsToAdd,
    workItemIdsToRemove,
    artifactId,
  } = options;

  try {
    // For each work item to add, create a link
    if (workItemIdsToAdd.length > 0) {
      const workItemTrackingApi = await connection.getWorkItemTrackingApi();

      for (const workItemId of workItemIdsToAdd) {
        // Add the relationship between the work item and pull request
        await workItemTrackingApi.updateWorkItem(
          null,
          [
            {
              op: 'add',
              path: '/relations/-',
              value: {
                rel: 'ArtifactLink',
                // Use the artifactId if available, otherwise fall back to the old format
                url:
                  artifactId ||
                  `vstfs:///Git/PullRequestId/${projectId ?? ''}/${repositoryId}/${pullRequestId}`,
                attributes: {
                  name: 'Pull Request',
                },
              },
            },
          ],
          workItemId,
        );
      }
    }

    // For each work item to remove, remove the link
    if (workItemIdsToRemove.length > 0) {
      const workItemTrackingApi = await connection.getWorkItemTrackingApi();

      for (const workItemId of workItemIdsToRemove) {
        try {
          // First, get the work item with relations expanded
          const workItem = await workItemTrackingApi.getWorkItem(
            workItemId,
            undefined, // fields
            undefined, // asOf
            4, // 4 = WorkItemExpand.Relations
          );

          if (workItem.relations) {
            // Find the relationship to the pull request using the artifactId
            const prRelationIndex = workItem.relations.findIndex(
              (rel: any) =>
                rel.rel === 'ArtifactLink' &&
                rel.attributes &&
                rel.attributes.name === 'Pull Request' &&
                rel.url === artifactId,
            );

            if (prRelationIndex !== -1) {
              // Remove the relationship
              await workItemTrackingApi.updateWorkItem(
                null,
                [
                  {
                    op: 'remove',
                    path: `/relations/${prRelationIndex}`,
                  },
                ],
                workItemId,
              );
            }
          }
        } catch (error) {
          console.log(
            `Error removing work item ${workItemId} from pull request ${pullRequestId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  } catch (error) {
    throw new AzureDevOpsError(
      `Failed to update work item links for pull request ${pullRequestId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Handle adding or removing reviewers from a pull request
 */
interface ReviewerHandlingOptions {
  connection: any;
  pullRequestId: number;
  repositoryId: string;
  projectId?: string;
  reviewersToAdd: string[];
  reviewersToRemove: string[];
}

async function handleReviewers(
  options: ReviewerHandlingOptions,
): Promise<void> {
  const {
    connection,
    pullRequestId,
    repositoryId,
    projectId,
    reviewersToAdd,
    reviewersToRemove,
  } = options;

  try {
    const gitApi = await connection.getGitApi();

    // Add reviewers
    if (reviewersToAdd.length > 0) {
      for (const reviewer of reviewersToAdd) {
        try {
          // Create a reviewer object with the identifier
          await gitApi.createPullRequestReviewer(
            {
              id: reviewer, // This can be email or ID
              isRequired: false,
            },
            repositoryId,
            pullRequestId,
            reviewer,
            projectId,
          );
        } catch (error) {
          console.log(
            `Error adding reviewer ${reviewer} to pull request ${pullRequestId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    // Remove reviewers
    if (reviewersToRemove.length > 0) {
      for (const reviewer of reviewersToRemove) {
        try {
          await gitApi.deletePullRequestReviewer(
            repositoryId,
            pullRequestId,
            reviewer,
            projectId,
          );
        } catch (error) {
          console.log(
            `Error removing reviewer ${reviewer} from pull request ${pullRequestId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  } catch (error) {
    throw new AzureDevOpsError(
      `Failed to update reviewers for pull request ${pullRequestId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

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
                url: `vstfs:///Git/PullRequestId/${projectId ?? ''}/${repositoryId}/${pullRequestId}`,
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
        // First, get the work item to find the relationship index
        const workItem = await workItemTrackingApi.getWorkItem(workItemId);

        if (workItem.relations) {
          const prLinkUrl = `vstfs:///Git/PullRequestId/${projectId ?? ''}/${repositoryId}/${pullRequestId}`;
          const prRelationIndex = workItem.relations.findIndex(
            (rel: any) =>
              rel.url === prLinkUrl &&
              rel.rel === 'ArtifactLink' &&
              rel.attributes.name === 'Pull Request',
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
      }
    }
  } catch (error) {
    throw new AzureDevOpsError(
      `Failed to update work item links for pull request ${pullRequestId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

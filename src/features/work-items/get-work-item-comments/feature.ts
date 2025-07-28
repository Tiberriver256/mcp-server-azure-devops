import { WebApi } from 'azure-devops-node-api';
import {
  CommentList,
  CommentSortOrder,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { GetWorkItemCommentsOptions } from '../types';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

/**
 * Returns a list of work item comments, pageable.
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param workItemId The ID of the work item
 * @param options Options for filtering comments
 * @returns Array of comment threads with their comments
 */
export async function getWorkItemComments(
  connection: WebApi,
  projectId: string,
  workItemId: number,
  options: GetWorkItemCommentsOptions = {},
): Promise<CommentList> {
  try {
    const {
      top = 200,
      continuationToken,
      includeDeleted = false,
      expand,
      order = CommentSortOrder.Asc,
    } = options;

    if (top <= 0) {
      throw new AzureDevOpsError(
        'The "top" parameter must be a positive number.',
      );
    }
    const witApi = await connection.getWorkItemTrackingApi();

    const comments = await witApi.getComments(
      projectId,
      workItemId,
      top,
      continuationToken,
      includeDeleted,
      expand,
      order,
    );

    if (!comments) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item ${workItemId} not found`,
      );
    }

    return comments;
  } catch (error: unknown) {
    if (
      error instanceof AzureDevOpsResourceNotFoundError ||
      error instanceof AzureDevOpsError
    ) {
      throw error;
    }
    throw new AzureDevOpsError('Failed to get work item comments', {
      cause: error,
    });
  }
}

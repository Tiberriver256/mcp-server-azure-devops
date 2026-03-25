import { WebApi } from 'azure-devops-node-api';
import {
  CommentSortOrder,
  WorkItemComment,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { GetWorkItemCommentsOptions } from '../types';

/**
 * Get comments for a work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for retrieving comments
 * @returns List of comments on the work item
 * @throws {AzureDevOpsResourceNotFoundError} If the work item is not found
 */
export async function getWorkItemComments(
  connection: WebApi,
  options: GetWorkItemCommentsOptions,
): Promise<WorkItemComment[]> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();

    const sortOrder =
      options.order === 'desc' ? CommentSortOrder.Desc : CommentSortOrder.Asc;

    const result = await witApi.getComments(
      options.projectId,
      options.workItemId,
      options.top,
      undefined, // continuationToken — not exposed for simplicity
      options.includeDeleted,
      undefined, // expand
      sortOrder,
    );

    if (!result) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${options.workItemId}' not found`,
      );
    }

    return result.comments ?? [];
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new AzureDevOpsError(
      `Failed to get work item comments: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

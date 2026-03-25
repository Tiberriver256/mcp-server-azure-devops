import { WebApi } from 'azure-devops-node-api';
import {
  CommentSortOrder,
  WorkItemComment,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import {
  AddWorkItemCommentOptions,
  GetWorkItemCommentsOptions,
  UpdateWorkItemCommentOptions,
} from '../types';

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

/**
 * Add a comment to a work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for adding the comment
 * @returns The created comment
 */
export async function addWorkItemComment(
  connection: WebApi,
  options: AddWorkItemCommentOptions,
): Promise<WorkItemComment> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();
    const result = await witApi.addComment(
      { text: options.text },
      options.projectId,
      options.workItemId,
    );
    if (!result) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${options.workItemId}' not found`,
      );
    }
    return result;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new AzureDevOpsError(
      `Failed to add work item comment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Update an existing comment on a work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for updating the comment
 * @returns The updated comment
 */
export async function updateWorkItemComment(
  connection: WebApi,
  options: UpdateWorkItemCommentOptions,
): Promise<WorkItemComment> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();
    const result = await witApi.updateComment(
      { text: options.text },
      options.projectId,
      options.workItemId,
      options.commentId,
    );
    if (!result) {
      throw new AzureDevOpsResourceNotFoundError(
        `Comment '${options.commentId}' on work item '${options.workItemId}' not found`,
      );
    }
    return result;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new AzureDevOpsError(
      `Failed to update work item comment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

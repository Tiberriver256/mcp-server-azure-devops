import { WebApi } from 'azure-devops-node-api';
import {
  CommentExpandOptions,
  CommentList,
  CommentSortOrder,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import { GetWorkItemCommentsOptions } from '../types';

/**
 * Get comments from a work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param project The ID or name of the project
 * @param workItemId The ID of the work item
 * @param options Options for filtering comments
 * @returns List of comments with pagination support
 */
export async function getWorkItemComments(
  connection: WebApi,
  project: string,
  workItemId: number,
  options: GetWorkItemCommentsOptions = {},
): Promise<CommentList> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();

    const order =
      options.order === 'asc'
        ? CommentSortOrder.Asc
        : options.order === 'desc'
          ? CommentSortOrder.Desc
          : undefined;

    const expand = options.includeRenderedText
      ? CommentExpandOptions.RenderedText
      : CommentExpandOptions.None;

    const comments = await witApi.getComments(
      project,
      workItemId,
      options.top,
      options.continuationToken,
      undefined, // includeDeleted
      expand,
      order,
    );

    return comments;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get work item comments: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

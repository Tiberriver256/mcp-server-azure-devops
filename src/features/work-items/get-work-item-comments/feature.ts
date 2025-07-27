import { WebApi } from 'azure-devops-node-api';
import {
  CommentList,
  CommentSortOrder,
  CommentExpandOptions,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

export async function getWorkItemComments(
  connection: WebApi,
  workItemId: number,
  project?: string,
  top: number = 200,
  continuationToken?: string,
  includeDeleted: boolean = false,
  expand?: CommentExpandOptions,
  order: CommentSortOrder = CommentSortOrder.Asc,
): Promise<CommentList> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();

    const comments = await witApi.getComments(
      project || '',
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
    if (error instanceof AzureDevOpsResourceNotFoundError) {
      throw error;
    }
    throw new AzureDevOpsError('Failed to get work item comments', {
      cause: error,
    });
  }
}

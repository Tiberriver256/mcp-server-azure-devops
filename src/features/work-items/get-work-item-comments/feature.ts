import { WebApi } from 'azure-devops-node-api';
import {
  CommentExpandOptions,
  CommentSortOrder,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { GetWorkItemCommentsOptions, CommentList } from '../types';

/**
 * Maps string-based expansion options to the CommentExpandOptions enum
 */
const expandMap: Record<string, CommentExpandOptions> = {
  none: CommentExpandOptions.None,
  reactions: CommentExpandOptions.Reactions,
  renderedtext: CommentExpandOptions.RenderedText,
  all: CommentExpandOptions.All,
};

/**
 * Maps string-based sort order options to the CommentSortOrder enum
 */
const orderMap: Record<string, CommentSortOrder> = {
  asc: CommentSortOrder.Asc,
  desc: CommentSortOrder.Desc,
};

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const errorObj = error as {
    statusCode?: number;
    response?: { status?: number };
  };

  return errorObj.statusCode === 404 || errorObj.response?.status === 404;
}

/**
 * Get comments for a work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for getting work item comments
 * @returns The list of work item comments
 */
export async function getWorkItemComments(
  connection: WebApi,
  options: GetWorkItemCommentsOptions,
): Promise<CommentList> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();
    const {
      workItemId,
      projectId,
      top,
      continuationToken,
      includeDeleted,
      expand = 'all',
      order = 'asc',
    } = options;

    let resolvedProjectId = projectId;
    if (!resolvedProjectId) {
      try {
        const workItem = await witApi.getWorkItem(workItemId, [
          'System.TeamProject',
        ]);
        if (
          !workItem ||
          !workItem.fields ||
          !workItem.fields['System.TeamProject']
        ) {
          throw new AzureDevOpsResourceNotFoundError(
            `Work item '${workItemId}' not found`,
          );
        }
        resolvedProjectId = workItem.fields['System.TeamProject'];
      } catch (error) {
        if (error instanceof AzureDevOpsError) {
          throw error;
        }
        if (isNotFoundError(error)) {
          throw new AzureDevOpsResourceNotFoundError(
            `Work item '${workItemId}' not found`,
          );
        }
        throw error;
      }
    }

    const expandVal =
      expandMap[expand.toLowerCase()] ?? CommentExpandOptions.All;
    const orderVal = orderMap[order.toLowerCase()] ?? CommentSortOrder.Asc;

    const commentList = await witApi.getComments(
      resolvedProjectId!,
      workItemId,
      top,
      continuationToken,
      includeDeleted,
      expandVal,
      orderVal,
    );

    if (!commentList) {
      throw new AzureDevOpsResourceNotFoundError(
        `Comments for work item '${workItemId}' not found`,
      );
    }

    return commentList;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new AzureDevOpsError(
      `Failed to get work item comments: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

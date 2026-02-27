import { WebApi } from 'azure-devops-node-api';
import {
  Comment,
  CommentCreate,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';

/**
 * Add a comment to a work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param project The ID or name of the project
 * @param workItemId The ID of the work item
 * @param text The comment text (markdown supported)
 * @returns The created comment
 */
export async function addWorkItemComment(
  connection: WebApi,
  project: string,
  workItemId: number,
  text: string,
): Promise<Comment> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();

    const request: CommentCreate = { text };
    const comment = await witApi.addComment(request, project, workItemId);

    if (!comment) {
      throw new Error('Failed to create work item comment');
    }

    return comment;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to add work item comment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

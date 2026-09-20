import { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import { DeleteWorkItemAttachmentOptions, WorkItem } from '../types';

/**
 * Delete an attachment from a work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for deleting the attachment
 * @returns The updated work item without the attachment
 */
export async function deleteWorkItemAttachment(
  connection: WebApi,
  options: DeleteWorkItemAttachmentOptions,
): Promise<WorkItem> {
  try {
    if (!options.workItemId) {
      throw new Error('Work item ID is required');
    }

    if (!options.attachmentId) {
      throw new Error('Attachment ID is required');
    }

    const witApi = await connection.getWorkItemTrackingApi();

    const workItem = await witApi.getWorkItem(
      options.workItemId,
      undefined,
      undefined,
      WorkItemExpand.Relations,
    );

    if (!workItem) {
      throw new Error(`Work item ${options.workItemId} not found`);
    }

    const relations = workItem.relations || [];
    const attachmentIndex = relations.findIndex(
      (relation) =>
        relation.rel === 'AttachedFile' &&
        relation.url?.includes(options.attachmentId),
    );

    if (attachmentIndex === -1) {
      throw new Error(
        `Attachment ${options.attachmentId} not found on work item ${options.workItemId}`,
      );
    }

    const document = [
      {
        op: 'remove',
        path: `/relations/${attachmentIndex}`,
      },
    ];

    const updatedWorkItem = await witApi.updateWorkItem(
      {},
      document,
      options.workItemId,
      undefined,
      false,
      false,
      false,
      WorkItemExpand.All,
    );

    if (!updatedWorkItem) {
      throw new Error('Failed to update work item after removing attachment');
    }

    return updatedWorkItem;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to delete attachment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

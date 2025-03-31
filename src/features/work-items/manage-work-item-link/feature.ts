import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { WorkItem } from '../types';

/**
 * Options for managing work item link
 */
interface ManageWorkItemLinkOptions {
  sourceWorkItemId: number;
  targetWorkItemId: number;
  operation: 'add' | 'remove' | 'update';
  relationType: string;
  newRelationType?: string;
  comment?: string;
}

/**
 * Manage (add, remove, or update) a link between two work items
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param options Options for managing the work item link
 * @returns The updated source work item
 * @throws {AzureDevOpsResourceNotFoundError} If either work item is not found
 */
export async function manageWorkItemLink(
  connection: WebApi,
  projectId: string,
  options: ManageWorkItemLinkOptions,
): Promise<WorkItem> {
  try {
    const {
      sourceWorkItemId,
      targetWorkItemId,
      operation,
      relationType,
      newRelationType,
      comment,
    } = options;

    // Input validation
    if (!sourceWorkItemId) {
      throw new Error('Source work item ID is required');
    }

    if (!targetWorkItemId) {
      throw new Error('Target work item ID is required');
    }

    if (!relationType) {
      throw new Error('Relation type is required');
    }

    if (operation === 'update' && !newRelationType) {
      throw new Error('New relation type is required for update operation');
    }

    const witApi = await connection.getWorkItemTrackingApi();

    // Create the JSON patch document
    const document = [];

    // Construct the relationship URL
    const relationshipUrl = `${connection.serverUrl}/_apis/wit/workItems/${targetWorkItemId}`;

    if (operation === 'add' || operation === 'update') {
      // For 'update', we'll first remove the old link, then add the new one
      if (operation === 'update') {
        document.push({
          op: 'remove',
          path: `/relations/+[rel=${relationType};url=${relationshipUrl}]`,
        });
      }

      // Add the new relationship
      document.push({
        op: 'add',
        path: '/relations/-',
        value: {
          rel: operation === 'update' ? newRelationType : relationType,
          url: relationshipUrl,
          ...(comment ? { attributes: { comment } } : {}),
        },
      });
    } else if (operation === 'remove') {
      // Remove the relationship
      document.push({
        op: 'remove',
        path: `/relations/+[rel=${relationType};url=${relationshipUrl}]`,
      });
    }

    // Update the work item with the new relationship
    const updatedWorkItem = await witApi.updateWorkItem(
      {}, // customHeaders
      document,
      sourceWorkItemId,
      projectId,
    );

    if (!updatedWorkItem) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${sourceWorkItemId}' not found`,
      );
    }

    return updatedWorkItem;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to manage work item link: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

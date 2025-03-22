import { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { WorkItem } from '../types';

/**
 * Get a work item by ID
 *
 * @param connection The Azure DevOps WebApi connection
 * @param workItemId The ID of the work item
 * @param expand Optional expansion options
 * @returns The work item details
 * @throws {AzureDevOpsResourceNotFoundError} If the work item is not found
 */
export async function getWorkItem(
  connection: WebApi,
  workItemId: number,
  expand?: WorkItemExpand,
): Promise<WorkItem> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();
    const fields = [
      'System.Id',
      'System.Title',
      'System.State',
      'System.AssignedTo',
    ];
    
    // Don't pass fields when using expand parameter
    const workItem = expand
      ? await witApi.getWorkItem(
          workItemId, 
          undefined, 
          undefined, 
          expand
        )
      : await witApi.getWorkItem(workItemId, fields);

    if (!workItem) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${workItemId}' not found`,
      );
    }

    return workItem;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get work item: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

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
 * @param expand Optional expansion options (defaults to WorkItemExpand.All)
 * @returns The work item details
 * @throws {AzureDevOpsResourceNotFoundError} If the work item is not found
 */
export async function getWorkItem(
  connection: WebApi,
  workItemId: number,
  expand: WorkItemExpand = WorkItemExpand.All,
): Promise<WorkItem> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();

    // Always use expand parameter for consistent behavior
    const workItem = await witApi.getWorkItem(
      workItemId,
      undefined,
      undefined,
      expand,
    );

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

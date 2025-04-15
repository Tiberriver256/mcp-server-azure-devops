import { WebApi } from 'azure-devops-node-api';
import {
  WorkItemExpand,
  WorkItemTypeFieldsExpandLevel,
  WorkItemTypeFieldWithReferences,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { WorkItem } from '../types';

const workItemTypeFieldsCache: Record<
  string,
  Record<string, WorkItemTypeFieldWithReferences[]>
> = {};

/**
 * Get a work item by ID
 *
 * @param connection The Azure DevOps WebApi connection
 * @param workItemId The ID of the work item
 * @param expand Optional expansion options (defaults to WorkItemExpand.All)
 * @returns The work item details with all fields (null for empty fields)
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

    // Extract project and work item type to get all possible fields
    const projectName = workItem.fields?.['System.TeamProject'];
    const workItemType = workItem.fields?.['System.WorkItemType'];

    if (!projectName || !workItemType) {
      // If we can't determine the project or type, return the original work item
      return workItem;
    }

    // Get all possible fields for this work item type
    const allFields =
      workItemTypeFieldsCache[projectName.toString()]?.[
        workItemType.toString()
      ] ??
      (await witApi.getWorkItemTypeFieldsWithReferences(
        projectName.toString(),
        workItemType.toString(),
        WorkItemTypeFieldsExpandLevel.All,
      ));

    workItemTypeFieldsCache[projectName.toString()] = {
      ...workItemTypeFieldsCache[projectName.toString()],
      [workItemType.toString()]: allFields,
    };

    // Create a new work item object with all fields
    const enhancedWorkItem = { ...workItem };

    // Initialize fields object if it doesn't exist
    if (!enhancedWorkItem.fields) {
      enhancedWorkItem.fields = {};
    }

    // Set null for all potential fields that don't have values
    for (const field of allFields) {
      if (
        field.referenceName &&
        !(field.referenceName in enhancedWorkItem.fields)
      ) {
        enhancedWorkItem.fields[field.referenceName] = field.defaultValue;
      }
    }

    return enhancedWorkItem;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get work item: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

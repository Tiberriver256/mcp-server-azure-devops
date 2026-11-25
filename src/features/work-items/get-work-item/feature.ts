import type { WebApi } from 'azure-devops-node-api';
import type { WorkItemTypeFieldWithReferences } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import {
  WorkItemExpand,
  WorkItemTypeFieldsExpandLevel,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors/index.ts';
import type { WorkItem } from '../types.ts';

const workItemTypeFieldsCache: Record<
  string,
  Record<string, WorkItemTypeFieldWithReferences[]>
> = {};

/**
 * Maps string-based expansion options to the WorkItemExpand enum
 */
const expandMap: Record<string, WorkItemExpand> = {
  none: WorkItemExpand.None,
  relations: WorkItemExpand.Relations,
  fields: WorkItemExpand.Fields,
  links: WorkItemExpand.Links,
  all: WorkItemExpand.All,
};

/**
 * Get a work item by ID
 *
 * @param connection The Azure DevOps WebApi connection
 * @param workItemId The ID of the work item
 * @param expand Optional expansion options (defaults to 'all')
 * @returns The work item details
 * @throws {AzureDevOpsResourceNotFoundError} If the work item is not found
 */
export async function getWorkItem(
  connection: WebApi,
  workItemId: number,
  expand: string = 'all',
): Promise<WorkItem> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();

    const workItem = await witApi.getWorkItem(
      workItemId,
      undefined,
      undefined,
      expandMap[expand.toLowerCase()],
    );

    if (!workItem) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${workItemId}' not found`,
      );
    }

    // Extract project and work item type to get all possible fields
    const rawProjectName: unknown = workItem.fields?.['System.TeamProject'];
    const rawWorkItemType: unknown = workItem.fields?.['System.WorkItemType'];
    const projectName =
      typeof rawProjectName === 'string'
        ? rawProjectName
        : typeof rawProjectName === 'number'
          ? String(rawProjectName)
          : '';
    const workItemType =
      typeof rawWorkItemType === 'string'
        ? rawWorkItemType
        : typeof rawWorkItemType === 'number'
          ? String(rawWorkItemType)
          : '';

    if (!projectName || !workItemType) {
      // If we can't determine the project or type, return the original work item
      return workItem;
    }

    // Get all possible fields for this work item type
    const allFields =
      workItemTypeFieldsCache[projectName]?.[workItemType] ??
      (await witApi.getWorkItemTypeFieldsWithReferences(
        projectName,
        workItemType,
        WorkItemTypeFieldsExpandLevel.All,
      ));

    workItemTypeFieldsCache[projectName] = {
      ...workItemTypeFieldsCache[projectName],
      [workItemType]: allFields,
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
        const defaultValue: unknown = field.defaultValue;
        enhancedWorkItem.fields[field.referenceName] = defaultValue;
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

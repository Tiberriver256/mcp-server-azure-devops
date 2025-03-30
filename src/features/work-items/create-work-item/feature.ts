import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsError } from '../../../shared/errors';
import { CreateWorkItemOptions, WorkItem } from '../types';

/**
 * Create a work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param workItemType The type of work item to create (e.g., "Task", "Bug", "User Story")
 * @param options Options for creating the work item
 * @returns The created work item
 */
export async function createWorkItem(
  connection: WebApi,
  projectId: string,
  workItemType: string,
  options: CreateWorkItemOptions,
): Promise<WorkItem> {
  try {
    if (!options.title) {
      throw new Error('Title is required');
    }

    const witApi = await connection.getWorkItemTrackingApi();

    // Create the JSON patch document
    const document = [];

    // Add required fields
    document.push({
      op: 'add',
      path: '/fields/System.Title',
      value: options.title,
    });

    // Add optional fields if provided
    if (options.description) {
      document.push({
        op: 'add',
        path: '/fields/System.Description',
        value: options.description,
      });
    }

    if (options.assignedTo) {
      document.push({
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: options.assignedTo,
      });
    }

    if (options.areaPath) {
      document.push({
        op: 'add',
        path: '/fields/System.AreaPath',
        value: options.areaPath,
      });
    }

    if (options.iterationPath) {
      document.push({
        op: 'add',
        path: '/fields/System.IterationPath',
        value: options.iterationPath,
      });
    }

    if (options.priority !== undefined) {
      document.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.Priority',
        value: options.priority,
      });
    }

    // Add parent relationship if parentId is provided
    if (options.parentId) {
      document.push({
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: `${connection.serverUrl}/_apis/wit/workItems/${options.parentId}`,
        },
      });
    }

    // Add any additional fields
    if (options.additionalFields) {
      for (const [key, value] of Object.entries(options.additionalFields)) {
        document.push({
          op: 'add',
          path: `/fields/${key}`,
          value: value,
        });
      }
    }

    // Create the work item
    const workItem = await witApi.createWorkItem(
      null,
      document,
      projectId,
      workItemType,
    );

    if (!workItem) {
      throw new Error('Failed to create work item');
    }

    return workItem;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to create work item: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

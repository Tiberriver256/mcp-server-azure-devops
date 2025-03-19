import { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { UpdateWorkItemOptions, WorkItem } from '../types';

/**
 * Update a work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param workItemId The ID of the work item to update
 * @param options Options for updating the work item
 * @returns The updated work item
 * @throws {AzureDevOpsResourceNotFoundError} If the work item is not found
 */
export async function updateWorkItem(
  connection: WebApi,
  workItemId: number,
  options: UpdateWorkItemOptions,
): Promise<WorkItem> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();

    // Create the JSON patch document
    const document = [];

    // Add optional fields if provided
    if (options.title) {
      document.push({
        op: 'add',
        path: '/fields/System.Title',
        value: options.title,
      });
    }

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

    if (options.priority) {
      document.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.Priority',
        value: options.priority,
      });
    }

    if (options.state) {
      document.push({
        op: 'add',
        path: '/fields/System.State',
        value: options.state,
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

    // If no fields to update, throw an error
    if (document.length === 0) {
      throw new Error('At least one field must be provided for update');
    }

    // Update the work item
    const updatedWorkItem = await witApi.updateWorkItem(
      {}, // customHeaders
      document,
      workItemId,
      undefined, // project
      false, // validateOnly
      false, // bypassRules
      false, // suppressNotifications
      WorkItemExpand.All, // expand
    );

    if (!updatedWorkItem) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${workItemId}' not found`,
      );
    }

    return updatedWorkItem;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to update work item: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

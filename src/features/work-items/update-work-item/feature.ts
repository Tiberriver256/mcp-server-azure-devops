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

    // Add tags logic
    // Azure DevOps treats op:'add' on System.Tags as additive (merge) rather
    // than a full replacement.  Use op:'replace' to truly overwrite when the
    // field already has a value; fall back to op:'add' when it is empty
    // (JSON-Patch 'replace' fails on a missing/empty field).
    if (options.tags !== undefined) {
      const currentWorkItem = await witApi.getWorkItem(workItemId, [
        'System.Tags',
      ]);
      if (!currentWorkItem) {
        throw new AzureDevOpsResourceNotFoundError(
          `Work item '${workItemId}' not found`,
        );
      }
      const currentTagsStr =
        (currentWorkItem.fields?.['System.Tags'] as string) || '';
      document.push({
        op: currentTagsStr ? 'replace' : 'add',
        path: '/fields/System.Tags',
        value: options.tags.length > 0 ? options.tags.join('; ') : '',
      });
    } else if (
      (options.tagsToAdd && options.tagsToAdd.length > 0) ||
      (options.tagsToRemove && options.tagsToRemove.length > 0)
    ) {
      const currentWorkItem = await witApi.getWorkItem(workItemId, [
        'System.Tags',
      ]);
      if (!currentWorkItem) {
        throw new AzureDevOpsResourceNotFoundError(
          `Work item '${workItemId}' not found`,
        );
      }

      const currentTagsStr =
        (currentWorkItem.fields?.['System.Tags'] as string) || '';
      let tagsList = currentTagsStr
        .split(';')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      if (options.tagsToAdd) {
        for (const tag of options.tagsToAdd) {
          const trimmed = tag.trim();
          const trimmedLower = trimmed.toLowerCase();
          if (
            trimmed &&
            !tagsList.some((t) => t.toLowerCase() === trimmedLower)
          ) {
            tagsList.push(trimmed);
          }
        }
      }

      if (options.tagsToRemove) {
        const toRemove = new Set(
          options.tagsToRemove.map((t) => t.trim().toLowerCase()),
        );
        tagsList = tagsList.filter((t) => !toRemove.has(t.toLowerCase()));
      }

      document.push({
        op: currentTagsStr ? 'replace' : 'add',
        path: '/fields/System.Tags',
        value: tagsList.length > 0 ? tagsList.join('; ') : '',
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

import type { WebApi } from 'azure-devops-node-api';
import type { TeamContext } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import type {
  WorkItem,
  WorkItemReference,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import type { ListWorkItemsOptions, WorkItem as WorkItemType } from '../types';

/**
 * Constructs the default WIQL query for listing work items
 */
function constructDefaultWiql(projectId: string, teamId?: string): string {
  let query = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectId}'`;
  if (teamId) {
    query += ` AND [System.TeamId] = '${teamId}'`;
  }
  query += ' ORDER BY [System.Id]';
  return query;
}

/**
 * List work items in a project
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for listing work items
 * @returns List of work items
 */
export async function listWorkItems(
  connection: WebApi,
  options: ListWorkItemsOptions,
): Promise<WorkItemType[]> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();
    const { projectId, teamId, queryId, wiql } = options;

    let workItemRefs: WorkItemReference[] = [];

    if (queryId) {
      const teamContext: TeamContext = {
        project: projectId,
        team: teamId,
      };
      const queryResult = await witApi.queryById(queryId, teamContext);
      workItemRefs = queryResult.workItems || [];
    } else {
      const query = wiql || constructDefaultWiql(projectId, teamId);
      const teamContext: TeamContext = {
        project: projectId,
        team: teamId,
      };
      const queryResult = await witApi.queryByWiql({ query }, teamContext);
      workItemRefs = queryResult.workItems || [];
    }

    // Apply pagination in memory
    const { top = 200, skip } = options;
    if (skip !== undefined) {
      workItemRefs = workItemRefs.slice(skip);
    }
    if (top !== undefined) {
      workItemRefs = workItemRefs.slice(0, top);
    }

    const workItemIds = workItemRefs
      .map((ref) => ref.id)
      .filter((id): id is number => id !== undefined);

    if (workItemIds.length === 0) {
      return [];
    }

    const defaultFields = [
      'System.Id',
      'System.Title',
      'System.State',
      'System.AssignedTo',
    ];
    const fields = options.fields
      ? [...new Set([...defaultFields, ...options.fields])]
      : defaultFields;

    // Azure DevOps getWorkItems accepts at most 200 IDs per request
    const MAX_BATCH_SIZE = 200;
    const allWorkItems: WorkItem[] = [];
    for (
      let offset = 0;
      offset < workItemIds.length;
      offset += MAX_BATCH_SIZE
    ) {
      const batch = workItemIds.slice(offset, offset + MAX_BATCH_SIZE);
      const workItems = await witApi.getWorkItems(
        batch,
        fields,
        undefined,
        undefined,
      );
      if (workItems) {
        for (const wi of workItems) {
          if (wi !== undefined) {
            allWorkItems.push(wi);
          }
        }
      }
    }

    return allWorkItems;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    // Check for specific error types and convert to appropriate Azure DevOps errors
    if (error instanceof Error) {
      if (
        error.message.includes('Authentication') ||
        error.message.includes('Unauthorized')
      ) {
        throw new AzureDevOpsAuthenticationError(
          `Failed to authenticate: ${error.message}`,
        );
      }

      if (
        error.message.includes('not found') ||
        error.message.includes('does not exist')
      ) {
        throw new AzureDevOpsResourceNotFoundError(
          `Resource not found: ${error.message}`,
        );
      }
    }

    throw new AzureDevOpsError(
      `Failed to list work items: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

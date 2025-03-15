import { z } from 'zod';
import { WebApi } from 'azure-devops-node-api';
import {
  WorkItem,
  WorkItemExpand,
  Wiql,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { TeamContext } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { AzureDevOpsResourceNotFoundError } from '../common/errors';

/**
 * Schema for getting a work item
 */
export const GetWorkItemSchema = z.object({
  workItemId: z.number().describe('The ID of the work item'),
});

/**
 * Schema for listing work items
 */
export const ListWorkItemsSchema = z.object({
  projectId: z.string().describe('The ID or name of the project'),
  teamId: z.string().optional().describe('The ID of the team'),
  queryId: z.string().optional().describe('ID of a saved work item query'),
  wiql: z.string().optional().describe('Work Item Query Language (WIQL) query'),
  top: z.number().optional().describe('Maximum number of work items to return'),
  skip: z.number().optional().describe('Number of work items to skip'),
});

/**
 * Get a work item by ID
 *
 * @param connection The Azure DevOps WebApi connection
 * @param workItemId The ID of the work item
 * @returns The work item details
 * @throws {AzureDevOpsResourceNotFoundError} If the work item is not found
 */
export async function getWorkItem(
  connection: WebApi,
  workItemId: number,
): Promise<WorkItem> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();
    const fields = [
      'System.Id',
      'System.Title',
      'System.State',
      'System.AssignedTo',
    ];
    const workItem = await witApi.getWorkItem(workItemId, fields);

    if (!workItem) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${workItemId}' not found`,
      );
    }

    return workItem;
  } catch (error) {
    if (error instanceof AzureDevOpsResourceNotFoundError) {
      throw error;
    }
    throw new Error(
      `Failed to get work item: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * List work items in a project
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Parameters for listing work items
 * @returns Array of work items
 */
export async function listWorkItems(
  connection: WebApi,
  options: z.infer<typeof ListWorkItemsSchema>,
): Promise<WorkItem[]> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();
    const teamContext: TeamContext = {
      projectId: options.projectId,
      teamId: options.teamId,
      project: options.projectId,
      team: options.teamId,
    };

    // If a WIQL query is provided, use that
    if (options.wiql) {
      const wiql: Wiql = {
        query: options.wiql,
      };
      const results = await witApi.queryByWiql(wiql, teamContext);

      if (!results || !results.workItems) {
        return [];
      }

      // Get full work item details for each result
      const workItemIds = results.workItems
        .map((wi) => wi.id)
        .filter((id): id is number => id !== undefined);
      if (workItemIds.length === 0) {
        return [];
      }

      const fields = [
        'System.Id',
        'System.Title',
        'System.State',
        'System.AssignedTo',
      ];
      const workItems = await witApi.getWorkItems(
        workItemIds,
        fields,
        undefined,
        WorkItemExpand.All,
      );
      return workItems.filter((wi): wi is WorkItem => wi !== undefined);
    }

    // If a saved query ID is provided, use that
    if (options.queryId) {
      const results = await witApi.queryById(options.queryId, teamContext);

      if (!results || !results.workItems) {
        return [];
      }

      // Get full work item details for each result
      const workItemIds = results.workItems
        .map((wi) => wi.id)
        .filter((id): id is number => id !== undefined);
      if (workItemIds.length === 0) {
        return [];
      }

      const fields = [
        'System.Id',
        'System.Title',
        'System.State',
        'System.AssignedTo',
      ];
      const workItems = await witApi.getWorkItems(
        workItemIds,
        fields,
        undefined,
        WorkItemExpand.All,
      );
      return workItems.filter((wi): wi is WorkItem => wi !== undefined);
    }

    // Default to getting all work items in the project
    const wiql: Wiql = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.Id]`,
    };
    const results = await witApi.queryByWiql(wiql, teamContext);

    if (!results || !results.workItems) {
      return [];
    }

    // Get full work item details for each result
    const workItemIds = results.workItems
      .map((wi) => wi.id)
      .filter((id): id is number => id !== undefined);
    if (workItemIds.length === 0) {
      return [];
    }

    const fields = [
      'System.Id',
      'System.Title',
      'System.State',
      'System.AssignedTo',
    ];
    const workItems = await witApi.getWorkItems(
      workItemIds,
      fields,
      undefined,
      WorkItemExpand.All,
    );
    return workItems.filter((wi): wi is WorkItem => wi !== undefined);
  } catch (error) {
    throw new Error(
      `Failed to list work items: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

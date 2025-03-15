import { z } from 'zod';
import { WebApi } from 'azure-devops-node-api';
import {
  WorkItem,
  WorkItemExpand,
  WorkItemReference,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { TeamContext } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { AzureDevOpsResourceNotFoundError, AzureDevOpsError } from '../common/errors';

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
 * Options for listing work items
 */
export interface ListWorkItemsOptions {
  projectId: string;
  teamId?: string;
  queryId?: string;
  wiql?: string;
  top?: number;
  skip?: number;
}

/**
 * Constructs the default WIQL query for listing work items
 * @param projectId The project ID
 * @param teamId Optional team ID
 * @returns The default WIQL query
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
    const workItem = await witApi.getWorkItem(workItemId, fields, undefined, expand);

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

/**
 * List work items in a project
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for listing work items
 * @returns Array of work items
 */
export async function listWorkItems(
  connection: WebApi,
  options: ListWorkItemsOptions,
): Promise<WorkItem[]> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();
    const { projectId, teamId, queryId, wiql } = options;

    let workItemRefs: WorkItemReference[] = [];

    if (queryId) {
      const teamContext: TeamContext = {
        project: projectId,
        team: teamId
      };
      const queryResult = await witApi.queryById(queryId, teamContext);
      workItemRefs = queryResult.workItems || [];
    } else {
      const query = wiql || constructDefaultWiql(projectId, teamId);
      const teamContext: TeamContext = {
        project: projectId,
        team: teamId
      };
      const queryResult = await witApi.queryByWiql(
        { query },
        teamContext
      );
      workItemRefs = queryResult.workItems || [];
    }

    // Apply pagination in memory
    const { top, skip } = options;
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

    if (!workItems) {
      return [];
    }

    return workItems.filter((wi): wi is WorkItem => wi !== undefined);
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to list work items: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

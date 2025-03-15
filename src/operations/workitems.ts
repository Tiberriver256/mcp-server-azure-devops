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
 * Schema for creating a work item
 */
export const CreateWorkItemSchema = z.object({
  projectId: z.string().describe('The ID or name of the project'),
  workItemType: z.string().describe('The type of work item to create (e.g., "Task", "Bug", "User Story")'),
  title: z.string().describe('The title of the work item'),
  description: z.string().optional().describe('The description of the work item'),
  assignedTo: z.string().optional().describe('The email or name of the user to assign the work item to'),
  areaPath: z.string().optional().describe('The area path for the work item'),
  iterationPath: z.string().optional().describe('The iteration path for the work item'),
  priority: z.number().optional().describe('The priority of the work item'),
  additionalFields: z.record(z.string(), z.any()).optional().describe('Additional fields to set on the work item'),
});

/**
 * Schema for updating a work item
 */
export const UpdateWorkItemSchema = z.object({
  workItemId: z.number().describe('The ID of the work item to update'),
  title: z.string().optional().describe('The updated title of the work item'),
  description: z.string().optional().describe('The updated description of the work item'),
  assignedTo: z.string().optional().describe('The email or name of the user to assign the work item to'),
  areaPath: z.string().optional().describe('The updated area path for the work item'),
  iterationPath: z.string().optional().describe('The updated iteration path for the work item'),
  priority: z.number().optional().describe('The updated priority of the work item'),
  state: z.string().optional().describe('The updated state of the work item'),
  additionalFields: z.record(z.string(), z.any()).optional().describe('Additional fields to update on the work item'),
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
 * Options for creating a work item
 */
export interface CreateWorkItemOptions {
  title: string;
  description?: string;
  assignedTo?: string;
  areaPath?: string;
  iterationPath?: string;
  priority?: number;
  additionalFields?: Record<string, any>;
}

/**
 * Options for updating a work item
 */
export interface UpdateWorkItemOptions {
  title?: string;
  description?: string;
  assignedTo?: string;
  areaPath?: string;
  iterationPath?: string;
  priority?: number;
  state?: string;
  additionalFields?: Record<string, any>;
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
  options: CreateWorkItemOptions
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
      value: options.title
    });
    
    // Add optional fields if provided
    if (options.description) {
      document.push({
        op: 'add',
        path: '/fields/System.Description',
        value: options.description
      });
    }
    
    if (options.assignedTo) {
      document.push({
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: options.assignedTo
      });
    }
    
    if (options.areaPath) {
      document.push({
        op: 'add',
        path: '/fields/System.AreaPath',
        value: options.areaPath
      });
    }
    
    if (options.iterationPath) {
      document.push({
        op: 'add',
        path: '/fields/System.IterationPath',
        value: options.iterationPath
      });
    }
    
    if (options.priority !== undefined) {
      document.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.Priority',
        value: options.priority
      });
    }
    
    // Add any additional fields
    if (options.additionalFields) {
      for (const [key, value] of Object.entries(options.additionalFields)) {
        document.push({
          op: 'add',
          path: `/fields/${key}`,
          value: value
        });
      }
    }
    
    // Create the work item
    const workItem = await witApi.createWorkItem(document, {}, projectId, workItemType);
    
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
  options: UpdateWorkItemOptions
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
        value: options.title
      });
    }
    
    if (options.description) {
      document.push({
        op: 'add',
        path: '/fields/System.Description',
        value: options.description
      });
    }
    
    if (options.assignedTo) {
      document.push({
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: options.assignedTo
      });
    }
    
    if (options.areaPath) {
      document.push({
        op: 'add',
        path: '/fields/System.AreaPath',
        value: options.areaPath
      });
    }
    
    if (options.iterationPath) {
      document.push({
        op: 'add',
        path: '/fields/System.IterationPath',
        value: options.iterationPath
      });
    }
    
    if (options.priority) {
      document.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.Priority',
        value: options.priority
      });
    }
    
    if (options.state) {
      document.push({
        op: 'add',
        path: '/fields/System.State',
        value: options.state
      });
    }
    
    // Add any additional fields
    if (options.additionalFields) {
      for (const [key, value] of Object.entries(options.additionalFields)) {
        document.push({
          op: 'add',
          path: `/fields/${key}`,
          value: value
        });
      }
    }
    
    // If no fields to update, throw an error
    if (document.length === 0) {
      throw new Error('At least one field must be provided for update');
    }
    
    // Update the work item
    const updatedWorkItem = await witApi.updateWorkItem(
      {},  // customHeaders
      document,
      workItemId,
      undefined,  // project
      false,  // validateOnly
      false,  // bypassRules
      false,  // suppressNotifications
      WorkItemExpand.All  // expand
    );
    
    if (!updatedWorkItem) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${workItemId}' not found`
      );
    }
    
    return updatedWorkItem;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to update work item: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

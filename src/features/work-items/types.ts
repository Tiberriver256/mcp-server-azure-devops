import {
  WorkItem,
  WorkItemReference,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';

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
  parentId?: number;
  additionalFields?: Record<string, string | number | boolean | null>;
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
  additionalFields?: Record<string, string | number | boolean | null>;
}

// Re-export WorkItem and WorkItemReference types for convenience
export type { WorkItem, WorkItemReference };

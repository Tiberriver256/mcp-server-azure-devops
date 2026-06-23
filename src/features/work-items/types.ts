import {
  WorkItem,
  WorkItemReference,
  CommentList,
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
  tags?: string[];
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
  tags?: string[];
  tagsToAdd?: string[];
  tagsToRemove?: string[];
  additionalFields?: Record<string, string | number | boolean | null>;
}

/**
 * Options for getting work item comments
 */
export interface GetWorkItemCommentsOptions {
  workItemId: number;
  projectId?: string;
  top?: number;
  continuationToken?: string;
  includeDeleted?: boolean;
  expand?: 'none' | 'reactions' | 'renderedText' | 'all';
  order?: 'asc' | 'desc';
}

// Re-export WorkItem, WorkItemReference and CommentList types for convenience
export type { WorkItem, WorkItemReference, CommentList };

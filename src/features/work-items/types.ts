import type {
  WorkItem,
  WorkItemReference,
  Comment,
  CommentList,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';

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
  /** Additional fields to include beyond the default four (Id, Title, State, AssignedTo). */
  fields?: string[];
}

export type DescriptionFormat = 'html' | 'markdown';
export type CommentTextFormat = 'markdown' | 'html';
export type WorkItemExpandOption =
  | 'none'
  | 'relations'
  | 'fields'
  | 'links'
  | 'all';

/**
 * Options for creating a work item
 */
export interface CreateWorkItemOptions {
  title: string;
  description?: string;
  descriptionFormat?: DescriptionFormat;
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
  descriptionFormat?: DescriptionFormat;
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

/**
 * Options for adding a comment to a work item
 */
export interface AddWorkItemCommentOptions {
  workItemId: number;
  text: string;
  projectId?: string;
  format?: CommentTextFormat;
}

/**
 * Result returned when adding a comment falls back to patching System.History
 * (e.g., on Azure DevOps Server 2019 RTM where the Comments CRUD API does not exist).
 */
export interface AddWorkItemCommentFallbackResult {
  workItemId: number;
  text: string;
  version?: number;
  url?: string;
  fallback: true;
  fallbackMethod: 'System.History';
}

/**
 * Result of adding a comment to a work item
 */
export type AddWorkItemCommentResult =
  | Comment
  | AddWorkItemCommentFallbackResult;

/**
 * Options for getting work item revisions
 */
export interface GetWorkItemRevisionsOptions {
  workItemId: number;
  projectId?: string;
  revisionNumber?: number;
  top?: number;
  skip?: number;
  expand?: WorkItemExpandOption;
}

/**
 * Options for creating an attachment on a work item
 */
export interface CreateWorkItemAttachmentOptions {
  filePath: string;
  fileName?: string;
  comment?: string;
}

/**
 * Options for getting an attachment from a work item
 */
export interface GetWorkItemAttachmentOptions {
  attachmentId: string;
  outputPath: string;
}

/**
 * Result of getting an attachment
 */
export interface GetWorkItemAttachmentResult {
  filePath: string;
  fileName: string;
  size: number;
}

/**
 * Options for deleting an attachment from a work item
 */
export interface DeleteWorkItemAttachmentOptions {
  workItemId: number;
  attachmentId: string;
}

// Re-export WorkItem, WorkItemReference, Comment and CommentList types for convenience
export type { WorkItem, WorkItemReference, Comment, CommentList };

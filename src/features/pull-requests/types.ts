import {
  GitPullRequest,
  Comment,
} from 'azure-devops-node-api/interfaces/GitInterfaces';

export type PullRequest = GitPullRequest;
export type PullRequestComment = Comment;

/**
 * Options for creating a pull request
 */
export interface CreatePullRequestOptions {
  title: string;
  description?: string;
  sourceRefName: string;
  targetRefName: string;
  reviewers?: string[];
  isDraft?: boolean;
  workItemRefs?: number[];
  additionalProperties?: Record<string, any>;
}

/**
 * Options for listing pull requests
 */
export interface ListPullRequestsOptions {
  projectId: string;
  repositoryId: string;
  status?: 'all' | 'active' | 'completed' | 'abandoned';
  creatorId?: string;
  reviewerId?: string;
  sourceRefName?: string;
  targetRefName?: string;
  top?: number;
}

/**
 * Options for getting pull request comments
 */
export interface GetPullRequestCommentsOptions {
  projectId: string;
  repositoryId: string;
  pullRequestId: number;
  threadId?: number;
  includeDeleted?: boolean;
  top?: number;
}

/**
 * Options for adding a comment to a pull request
 */
export interface AddPullRequestCommentOptions {
  projectId: string;
  repositoryId: string;
  pullRequestId: number;
  content: string;
  // For responding to an existing comment
  threadId?: number;
  parentCommentId?: number;
  // For file comments (new threads)
  filePath?: string;
  lineNumber?: number;
  // Additional options
  status?: 'active' | 'fixed' | 'wontFix' | 'closed' | 'pending';
}

/**
 * Options for updating a pull request
 */
export interface UpdatePullRequestOptions {
  projectId: string;
  repositoryId: string;
  pullRequestId: number;
  title?: string;
  description?: string;
  status?: 'active' | 'abandoned' | 'completed';
  isDraft?: boolean;
  addWorkItemIds?: number[];
  removeWorkItemIds?: number[];
  addReviewers?: string[]; // Array of reviewer identifiers (email or ID)
  removeReviewers?: string[]; // Array of reviewer identifiers (email or ID)
  additionalProperties?: Record<string, any>;
}

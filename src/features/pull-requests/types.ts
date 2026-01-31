import {
  GitPullRequest,
  Comment,
  GitPullRequestCommentThread,
  CommentPosition,
} from 'azure-devops-node-api/interfaces/GitInterfaces';

export type PullRequest = GitPullRequest;
export type PullRequestComment = Comment;

/**
 * Extended Comment type with string enum values
 */
export interface CommentWithStringEnums extends Omit<Comment, 'commentType'> {
  commentType?: string;
  filePath?: string;
  leftFileStart?: CommentPosition;
  leftFileEnd?: CommentPosition;
  rightFileStart?: CommentPosition;
  rightFileEnd?: CommentPosition;
}

/**
 * Extended GitPullRequestCommentThread type with string enum values
 */
export interface CommentThreadWithStringEnums
  extends Omit<GitPullRequestCommentThread, 'status' | 'comments'> {
  status?: string;
  comments?: CommentWithStringEnums[];
}

/**
 * Response type for add comment operations
 */
export interface AddCommentResponse {
  comment: CommentWithStringEnums;
  thread?: CommentThreadWithStringEnums;
}

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
  tags?: string[];
  additionalProperties?: Record<string, string | number | boolean>;
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
  skip?: number;
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
  repositoryId?: string;
  pullRequestId: number;
  content: string;
  // For responding to an existing comment
  threadId?: number;
  parentCommentId?: number;
  // For file comments (new threads)
  filePath?: string;
  lineNumber?: number;
  // Additional options
  status?:
    | 'active'
    | 'fixed'
    | 'wontFix'
    | 'closed'
    | 'pending'
    | 'byDesign'
    | 'unknown';
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
  addTags?: string[];
  removeTags?: string[];
  additionalProperties?: Record<string, string | number | boolean>;
}

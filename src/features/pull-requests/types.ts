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
 * Options for updating a pull request
 */
export interface UpdatePullRequestOptions {
  title?: string;
  description?: string;
  status?: 'active' | 'completed' | 'abandoned';
  reviewers?: string[];
  isDraft?: boolean;
  additionalProperties?: Record<string, any>;
}

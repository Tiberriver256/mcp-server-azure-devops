import type {
  GitPullRequest,
  Comment,
  GitPullRequestCommentThread,
  CommentPosition,
  IdentityRefWithVote,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';

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
export interface CommentThreadWithStringEnums extends Omit<
  GitPullRequestCommentThread,
  'status' | 'comments'
> {
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
  endLineNumber?: number;
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

/**
 * Options for updating a pull request thread status
 */
export interface UpdatePullRequestThreadStatusOptions {
  projectId?: string;
  organizationId?: string;
  repositoryId?: string;
  pullRequestId: number;
  threadId: number;
  status:
    | 'active'
    | 'fixed'
    | 'wontFix'
    | 'closed'
    | 'pending'
    | 'byDesign'
    | 'unknown';
}

/**
 * Response type for updating a pull request thread status
 */
export interface UpdatePullRequestThreadStatusResponse {
  thread: CommentThreadWithStringEnums;
}

/**
 * Supported merge strategy string names for completing a pull request
 */
export type PullRequestMergeStrategyName =
  | 'noFastForward'
  | 'squash'
  | 'rebase'
  | 'rebaseMerge';

/**
 * Options for merging or completing a pull request
 */
export interface MergePullRequestOptions {
  projectId?: string;
  repositoryId?: string;
  pullRequestId: number;
  mergeStrategy?: PullRequestMergeStrategyName;
  deleteSourceBranch?: boolean;
  transitionWorkItems?: boolean;
  mergeCommitMessage?: string;
  bypassPolicy?: boolean;
  bypassReason?: string;
  autoComplete?: boolean;
  autoCompleteIgnoreConfigIds?: number[];
  lastMergeSourceCommitId?: string;
}

/**
 * Friendly string labels for Azure DevOps pull request votes
 */
export type PullRequestVoteString =
  | 'approved'
  | 'approvedWithSuggestions'
  | 'noVote'
  | 'waitingForAuthor'
  | 'rejected';

/**
 * Exact numeric Azure DevOps pull request vote values
 */
export type PullRequestNumericVote = 10 | 5 | 0 | -5 | -10;

/**
 * Accepted vote input (numeric or friendly string)
 */
export type PullRequestVoteInput =
  | PullRequestNumericVote
  | PullRequestVoteString;

/**
 * Options for voting on a pull request
 */
export interface VotePullRequestOptions {
  projectId?: string;
  organizationId?: string;
  repositoryId?: string;
  pullRequestId: number;
  vote: PullRequestVoteInput;
  reviewerId?: string;
  isRequired?: boolean;
  isReapprove?: boolean;
  hasDeclined?: boolean;
}

/**
 * Response returned by vote_pull_request
 */
export interface VotePullRequestResponse extends IdentityRefWithVote {
  pullRequestId: number;
  repositoryId: string;
  voteLabel: PullRequestVoteString;
}

/**
 * Supported actions for managing pull request reviewers
 */
export type ManagePullRequestReviewersAction =
  | 'list'
  | 'add'
  | 'update'
  | 'remove';

/**
 * Reviewer entry accepted in manage_pull_request_reviewers
 */
export type ReviewerInput =
  | string
  | {
      id?: string;
      reviewer?: string;
      isRequired?: boolean;
    };

/**
 * Options for managing pull request reviewers
 */
export interface ManagePullRequestReviewersOptions {
  projectId?: string;
  organizationId?: string;
  repositoryId?: string;
  pullRequestId: number;
  action: ManagePullRequestReviewersAction;
  reviewers?: ReviewerInput[];
  reviewerId?: string;
  isRequired?: boolean;
}

/**
 * Per-reviewer outcome for add/update/remove mutations
 */
export interface ReviewerMutationResult {
  input: string;
  id?: string;
  status: 'succeeded' | 'failed';
  reviewer?: IdentityRefWithVote;
  error?: string;
}

/**
 * Response for manage_pull_request_reviewers list action
 */
export interface ManagePullRequestReviewersListResponse {
  action: 'list';
  pullRequestId: number;
  repositoryId: string;
  count: number;
  reviewers: IdentityRefWithVote[];
}

/**
 * Response for manage_pull_request_reviewers add/update/remove actions
 */
export interface ManagePullRequestReviewersMutationResponse {
  action: 'add' | 'update' | 'remove';
  pullRequestId: number;
  repositoryId: string;
  results: ReviewerMutationResult[];
  succeeded: ReviewerMutationResult[];
  failed: ReviewerMutationResult[];
  hasErrors: boolean;
}

export type ManagePullRequestReviewersResponse =
  | ManagePullRequestReviewersListResponse
  | ManagePullRequestReviewersMutationResponse;

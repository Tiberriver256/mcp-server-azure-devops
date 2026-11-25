import { z } from 'zod';

const defaultProjectDesc =
  'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)';
const defaultOrgDesc =
  'The ID or name of the organization (defaults to configured organization)';

/**
 * Schema for creating a pull request
 */
export const CreatePullRequestSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
  title: z.string().describe('The title of the pull request'),
  description: z
    .string()
    .optional()
    .describe('The description of the pull request (markdown is supported)'),
  sourceRefName: z
    .string()
    .describe('The source branch name (e.g., refs/heads/feature-branch)'),
  targetRefName: z
    .string()
    .describe('The target branch name (e.g., refs/heads/main)'),
  reviewers: z
    .array(z.string())
    .optional()
    .describe('List of reviewer email addresses or IDs'),
  isDraft: z
    .boolean()
    .optional()
    .describe('Whether the pull request should be created as a draft'),
  workItemRefs: z
    .array(z.number())
    .optional()
    .describe('List of work item IDs to link to the pull request'),
  tags: z
    .array(z.string().trim().min(1))
    .optional()
    .describe('List of tags to apply to the pull request'),
  additionalProperties: z
    .record(z.string(), z.any())
    .optional()
    .describe('Additional properties to set on the pull request'),
});

/**
 * Schema for getting a pull request by ID (no repositoryId required)
 */
export const GetPullRequestSchema = z.object({
  projectId: z.string().describe('The ID or name of the project'),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  pullRequestId: z.number().describe('The ID of the pull request'),
});

/**
 * Schema for listing pull requests
 */
export const ListPullRequestsSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
  status: z
    .enum(['all', 'active', 'completed', 'abandoned'])
    .optional()
    .describe('Filter by pull request status'),
  creatorId: z
    .string()
    .optional()
    .describe('Filter by creator ID (must be a UUID string)'),
  reviewerId: z
    .string()
    .optional()
    .describe('Filter by reviewer ID (must be a UUID string)'),
  sourceRefName: z.string().optional().describe('Filter by source branch name'),
  targetRefName: z.string().optional().describe('Filter by target branch name'),
  top: z
    .number()
    .default(10)
    .describe('Maximum number of pull requests to return (default: 10)'),
  skip: z
    .number()
    .optional()
    .describe('Number of pull requests to skip for pagination'),
});

/**
 * Schema for getting pull request comments
 */
export const GetPullRequestCommentsSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
  pullRequestId: z.number().describe('The ID of the pull request'),
  threadId: z
    .number()
    .optional()
    .describe('The ID of the specific thread to get comments from'),
  includeDeleted: z
    .boolean()
    .optional()
    .describe('Whether to include deleted comments'),
  top: z
    .number()
    .optional()
    .describe('Maximum number of threads/comments to return'),
});

/**
 * Schema for adding a comment to a pull request
 */
export const AddPullRequestCommentSchema = z
  .object({
    projectId: z.string().optional().describe(defaultProjectDesc),
    organizationId: z.string().optional().describe(defaultOrgDesc),
    repositoryId: z
      .string()
      .optional()
      .describe(
        'The ID or name of the repository (optional; derived from pullRequestId when omitted)',
      ),
    pullRequestId: z.number().describe('The ID of the pull request'),
    content: z.string().describe('The content of the comment in markdown'),
    threadId: z
      .number()
      .optional()
      .describe('The ID of the thread to add the comment to'),
    parentCommentId: z
      .number()
      .optional()
      .describe(
        'ID of the parent comment when replying to an existing comment',
      ),
    filePath: z
      .string()
      .optional()
      .describe('The path of the file to comment on (for new thread on file)'),
    lineNumber: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('The line number to comment on (for new thread on file)'),
    endLineNumber: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'The last line of the commented range (default: lineNumber; requires filePath and lineNumber). The thread covers the lines in full, so a suggestion replaces exactly these lines',
      ),
    status: z
      .enum([
        'active',
        'fixed',
        'wontFix',
        'closed',
        'pending',
        'byDesign',
        'unknown',
      ])
      .optional()
      .describe('The status to set for a new thread'),
  })
  .superRefine((data, ctx) => {
    // If we're creating a new thread (no threadId), status is required
    if (!data.threadId && !data.status) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Status is required when creating a new thread',
        path: ['status'],
      });
    }

    if (data.endLineNumber !== undefined) {
      if (!data.filePath || data.lineNumber === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endLineNumber requires filePath and lineNumber',
          path: ['endLineNumber'],
        });
      } else if (data.endLineNumber < data.lineNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endLineNumber must not be less than lineNumber',
          path: ['endLineNumber'],
        });
      }
    }
  });

/**
 * Schema for updating a pull request
 */
export const UpdatePullRequestSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
  pullRequestId: z.number().describe('The ID of the pull request to update'),
  title: z
    .string()
    .optional()
    .describe('The updated title of the pull request'),
  description: z
    .string()
    .optional()
    .describe('The updated description of the pull request'),
  status: z
    .enum(['active', 'abandoned', 'completed'])
    .optional()
    .describe('The updated status of the pull request'),
  isDraft: z
    .boolean()
    .optional()
    .describe(
      'Whether the pull request should be marked as a draft (true) or unmarked (false)',
    ),
  addWorkItemIds: z
    .array(z.number())
    .optional()
    .describe('List of work item IDs to link to the pull request'),
  removeWorkItemIds: z
    .array(z.number())
    .optional()
    .describe('List of work item IDs to unlink from the pull request'),
  addReviewers: z
    .array(z.string())
    .optional()
    .describe('List of reviewer email addresses or IDs to add'),
  removeReviewers: z
    .array(z.string())
    .optional()
    .describe('List of reviewer email addresses or IDs to remove'),
  addTags: z
    .array(z.string().trim().min(1))
    .optional()
    .describe('List of tags to add to the pull request'),
  removeTags: z
    .array(z.string().trim().min(1))
    .optional()
    .describe('List of tags to remove from the pull request'),
  additionalProperties: z
    .record(z.string(), z.any())
    .optional()
    .describe('Additional properties to update on the pull request'),
});

/**
 * Schema for getting pull request changes and policy evaluations
 */
export const GetPullRequestChangesSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
  pullRequestId: z.number().describe('The ID of the pull request'),
});

/**
 * Schema for retrieving pull request status checks and policy evaluations
 */
export const GetPullRequestChecksSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
  pullRequestId: z.number().describe('The ID of the pull request'),
});

export const PullRequestFileChangeSchema = z.object({
  path: z.string().describe('Path of the changed file'),
  patch: z.string().describe('Unified diff of the file'),
});

export const GetPullRequestChangesResponseSchema = z.object({
  changes: z.any(),
  evaluations: z.array(z.any()),
  files: z.array(PullRequestFileChangeSchema),
  sourceRefName: z.string().optional(),
  targetRefName: z.string().optional(),
});

/**
 * Schema for updating pull request thread status
 */
export const UpdatePullRequestThreadStatusSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the repository (optional; derived from pullRequestId when omitted)',
    ),
  pullRequestId: z.number().describe('The ID of the pull request'),
  threadId: z.number().describe('The ID of the thread to update'),
  status: z
    .enum([
      'active',
      'fixed',
      'wontFix',
      'closed',
      'pending',
      'byDesign',
      'unknown',
    ])
    .describe('The status to set on the thread'),
});

/**
 * Schema for merging or completing a pull request (including auto-complete management)
 */
export const MergePullRequestSchema = z
  .object({
    projectId: z
      .string()
      .optional()
      .describe(
        'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT; derived from pullRequestId when omitted and no default project is configured)',
      ),
    repositoryId: z
      .string()
      .optional()
      .describe(
        'The ID or name of the repository (optional; derived from pullRequestId when omitted)',
      ),
    pullRequestId: z
      .number()
      .int()
      .positive()
      .describe('The ID of the pull request to merge or complete'),
    mergeStrategy: z
      .enum(['noFastForward', 'squash', 'rebase', 'rebaseMerge'])
      .optional()
      .describe(
        'Merge strategy: noFastForward (standard merge commit), squash, rebase, or rebaseMerge (optional; defaults to repository policy when omitted)',
      ),
    deleteSourceBranch: z
      .boolean()
      .optional()
      .describe('Delete the source branch after the pull request completes'),
    transitionWorkItems: z
      .boolean()
      .optional()
      .describe(
        'Transition linked work items to the next logical state upon completion',
      ),
    mergeCommitMessage: z
      .string()
      .optional()
      .describe('Custom commit message for the merge or squash commit'),
    bypassPolicy: z
      .boolean()
      .optional()
      .describe(
        'Explicitly bypass branch policies when completing (requires Bypass Policies permission)',
      ),
    bypassReason: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Reason recorded when bypassPolicy is true'),
    autoComplete: z
      .boolean()
      .optional()
      .describe(
        'Set true to enable auto-complete (merge automatically once policies pass), false to cancel auto-complete, or omit to complete/merge immediately',
      ),
    autoCompleteIgnoreConfigIds: z
      .array(z.number().int().positive())
      .optional()
      .describe(
        'Optional policy configuration IDs that auto-complete should not wait for (requires autoComplete: true; only applies to optional policies)',
      ),
    lastMergeSourceCommitId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Optional expected source head commit SHA for optimistic concurrency; if omitted during immediate completion, fetched automatically from the pull request',
      ),
  })
  .superRefine((data, ctx) => {
    if (data.bypassReason !== undefined && data.bypassPolicy !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'bypassReason requires bypassPolicy to be true',
        path: ['bypassReason'],
      });
    }
    if (data.autoComplete === false && data.bypassPolicy === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'bypassPolicy cannot be used when canceling auto-complete',
        path: ['bypassPolicy'],
      });
    }
    if (
      data.autoCompleteIgnoreConfigIds !== undefined &&
      data.autoComplete !== true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'autoCompleteIgnoreConfigIds requires autoComplete to be true',
        path: ['autoCompleteIgnoreConfigIds'],
      });
    }
  });

/**
 * Schema for casting or resetting a vote on a pull request
 */
export const VotePullRequestSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT; derived from pullRequestId when omitted and no default project is configured)',
    ),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the repository (optional; derived from pullRequestId when omitted)',
    ),
  pullRequestId: z
    .number()
    .int()
    .positive()
    .describe('The ID of the pull request to vote on'),
  vote: z
    .union([
      z.literal(10),
      z.literal(5),
      z.literal(0),
      z.literal(-5),
      z.literal(-10),
      z.enum([
        'approved',
        'approvedWithSuggestions',
        'noVote',
        'waitingForAuthor',
        'rejected',
      ]),
    ])
    .describe(
      'Vote to cast: 10/"approved", 5/"approvedWithSuggestions", 0/"noVote" (reset vote), -5/"waitingForAuthor", or -10/"rejected"',
    ),
  reviewerId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Reviewer GUID, email, uniqueName, or display name (optional; defaults to the authenticated caller)',
    ),
  isRequired: z
    .boolean()
    .optional()
    .describe(
      'Whether the reviewer is required (optional; preserves existing required status when omitted)',
    ),
  isReapprove: z
    .boolean()
    .optional()
    .describe('Whether to mark the vote as a re-approval'),
  hasDeclined: z
    .boolean()
    .optional()
    .describe('Whether the reviewer has declined the review'),
});

const ReviewerEntrySchema = z.union([
  z
    .string()
    .trim()
    .min(1)
    .describe('Reviewer GUID, email, uniqueName, or display name'),
  z
    .object({
      id: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Reviewer GUID, email, uniqueName, or display name'),
      reviewer: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Alias for id: reviewer GUID, email, uniqueName, or display name',
        ),
      isRequired: z
        .boolean()
        .optional()
        .describe(
          'Whether this reviewer is required (overrides top-level isRequired)',
        ),
    })
    .refine((entry) => Boolean(entry.id ?? entry.reviewer), {
      message: 'Reviewer object must specify id or reviewer',
    }),
]);

/**
 * Schema for listing, adding, updating, or removing pull request reviewers
 */
export const ManagePullRequestReviewersSchema = z
  .object({
    projectId: z
      .string()
      .optional()
      .describe(
        'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT; derived from pullRequestId when omitted and no default project is configured)',
      ),
    organizationId: z.string().optional().describe(defaultOrgDesc),
    repositoryId: z
      .string()
      .optional()
      .describe(
        'The ID or name of the repository (optional; derived from pullRequestId when omitted)',
      ),
    pullRequestId: z
      .number()
      .int()
      .positive()
      .describe('The ID of the pull request'),
    action: z
      .enum(['list', 'add', 'update', 'remove'])
      .describe('Action to perform on pull request reviewers'),
    reviewers: z
      .array(ReviewerEntrySchema)
      .optional()
      .describe(
        'List of reviewers (GUID, email, uniqueName, display name, or { id/reviewer, isRequired }) for add, update, or remove actions',
      ),
    reviewerId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Single reviewer GUID, email, uniqueName, or display name for add, update, or remove actions',
      ),
    isRequired: z
      .boolean()
      .optional()
      .describe(
        'Default isRequired flag for add/update when not specified per reviewer',
      ),
  })
  .superRefine((data, ctx) => {
    if (data.action !== 'list') {
      const hasReviewers =
        Array.isArray(data.reviewers) && data.reviewers.length > 0;
      const hasSingleReviewer =
        typeof data.reviewerId === 'string' && data.reviewerId.length > 0;
      if (!hasReviewers && !hasSingleReviewer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Action '${data.action}' requires at least one reviewer via 'reviewers' or 'reviewerId'`,
          path: ['reviewers'],
        });
      }
    }
  });

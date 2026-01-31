import { z } from 'zod';
import { defaultProject, defaultOrg } from '../../utils/environment';

/**
 * Schema for creating a pull request
 */
export const CreatePullRequestSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
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
 * Schema for listing pull requests
 */
export const ListPullRequestsSchema = z
  .object({
    projectId: z
      .string()
      .optional()
      .describe(`The ID or name of the project (Default: ${defaultProject})`),
    organizationId: z
      .string()
      .optional()
      .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
    repositoryId: z
      .string()
      .optional()
      .describe(
        'The ID or name of the repository (required unless pullRequestId is provided)',
      ),
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
    sourceRefName: z
      .string()
      .optional()
      .describe('Filter by source branch name'),
    targetRefName: z
      .string()
      .optional()
      .describe('Filter by target branch name'),
    top: z
      .number()
      .default(10)
      .describe('Maximum number of pull requests to return (default: 10)'),
    skip: z
      .number()
      .optional()
      .describe('Number of pull requests to skip for pagination'),
    pullRequestId: z
      .number()
      .optional()
      .describe('If provided, return only the matching pull request ID'),
  })
  .superRefine((data, ctx) => {
    if (!data.pullRequestId && !data.repositoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'repositoryId is required unless pullRequestId is provided (use pullRequestId to fetch a PR without knowing its repository)',
        path: ['repositoryId'],
      });
    }
  });

/**
 * Schema for getting pull request comments
 */
export const GetPullRequestCommentsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
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
    projectId: z
      .string()
      .optional()
      .describe(`The ID or name of the project (Default: ${defaultProject})`),
    organizationId: z
      .string()
      .optional()
      .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
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
      .optional()
      .describe('The line number to comment on (for new thread on file)'),
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
  });

/**
 * Schema for updating a pull request
 */
export const UpdatePullRequestSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
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
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  repositoryId: z.string().describe('The ID or name of the repository'),
  pullRequestId: z.number().describe('The ID of the pull request'),
});

/**
 * Schema for retrieving pull request status checks and policy evaluations
 */
export const GetPullRequestChecksSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
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

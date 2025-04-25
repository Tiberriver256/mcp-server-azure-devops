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
    .describe('The description of the pull request'),
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
  additionalProperties: z
    .record(z.string(), z.any())
    .optional()
    .describe('Additional properties to set on the pull request'),
});

/**
 * Schema for listing pull requests
 */
export const ListPullRequestsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  repositoryId: z.string().describe('The ID or name of the repository'),
  status: z
    .enum(['all', 'active', 'completed', 'abandoned'])
    .optional()
    .describe('Filter by pull request status'),
  creatorId: z.string().optional().describe('Filter by creator ID or email'),
  reviewerId: z.string().optional().describe('Filter by reviewer ID or email'),
  sourceRefName: z.string().optional().describe('Filter by source branch name'),
  targetRefName: z.string().optional().describe('Filter by target branch name'),
  top: z
    .number()
    .optional()
    .describe('Maximum number of pull requests to return'),
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

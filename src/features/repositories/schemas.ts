import { z } from 'zod';
import { defaultProject, defaultOrg } from '../../utils/environment';

/**
 * Schema for getting a repository
 */
export const GetRepositorySchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  repositoryId: z.string().describe('The ID or name of the repository'),
});

/**
 * Schema for getting detailed repository information
 */
export const GetRepositoryDetailsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  repositoryId: z.string().describe('The ID or name of the repository'),
  includeStatistics: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to include branch statistics'),
  includeRefs: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to include repository refs'),
  refFilter: z
    .string()
    .optional()
    .describe('Optional filter for refs (e.g., "heads/" or "tags/")'),
  branchName: z
    .string()
    .optional()
    .describe(
      'Name of specific branch to get statistics for (if includeStatistics is true)',
    ),
});

/**
 * Schema for listing repositories
 */
export const ListRepositoriesSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  includeLinks: z
    .boolean()
    .optional()
    .describe('Whether to include reference links'),
});

/**
 * Schema for getting file content
 */
export const GetFileContentSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  repositoryId: z.string().describe('The ID or name of the repository'),
  path: z
    .string()
    .optional()
    .default('/')
    .describe('Path to the file or folder'),
  version: z
    .string()
    .optional()
    .describe('The version (branch, tag, or commit) to get content from'),
  versionType: z
    .enum(['branch', 'commit', 'tag'])
    .optional()
    .describe('Type of version specified (branch, commit, or tag)'),
});

/**
 * Schema for getting all repositories tree structure
 */
export const GetAllRepositoriesTreeSchema = z.object({
  organizationId: z
    .string()
    .optional()
    .describe(
      `The ID or name of the Azure DevOps organization (Default: ${defaultOrg})`,
    ),
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  repositoryPattern: z
    .string()
    .optional()
    .describe(
      'Repository name pattern (wildcard characters allowed) to filter which repositories are included',
    ),
  depth: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .default(0)
    .describe(
      'Maximum depth to traverse within each repository (0 = unlimited)',
    ),
  pattern: z
    .string()
    .optional()
    .describe(
      'File pattern (wildcard characters allowed) to filter files by within each repository',
    ),
});

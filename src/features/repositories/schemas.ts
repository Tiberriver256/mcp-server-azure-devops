import { z } from 'zod';

/**
 * Schema for getting a repository
 */
export const GetRepositorySchema = z.object({
  projectId: z.string().describe('The ID or name of the project'),
  repositoryId: z.string().describe('The ID or name of the repository'),
});

/**
 * Schema for getting detailed repository information
 */
export const GetRepositoryDetailsSchema = z.object({
  projectId: z.string().describe('The ID or name of the project'),
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
    .describe('Name of specific branch to get statistics for (if includeStatistics is true)'),
});

/**
 * Schema for listing repositories
 */
export const ListRepositoriesSchema = z.object({
  projectId: z.string().describe('The ID or name of the project'),
  includeLinks: z
    .boolean()
    .optional()
    .describe('Whether to include reference links'),
});

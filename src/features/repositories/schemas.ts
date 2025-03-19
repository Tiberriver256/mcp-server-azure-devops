import { z } from 'zod';

/**
 * Schema for getting a repository
 */
export const GetRepositorySchema = z.object({
  projectId: z.string().describe('The ID or name of the project'),
  repositoryId: z.string().describe('The ID or name of the repository'),
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

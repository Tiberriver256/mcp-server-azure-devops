import { z } from 'zod';

/**
 * Schema for searching code in Azure DevOps repositories
 */
export const SearchCodeSchema = z.object({
  searchText: z.string().describe('The text to search for'),
  projectId: z.string().describe('The ID or name of the project to search in'),
  filters: z
    .object({
      Repository: z
        .array(z.string())
        .optional()
        .describe('Filter by repository names'),
      Path: z.array(z.string()).optional().describe('Filter by file paths'),
      Branch: z.array(z.string()).optional().describe('Filter by branch names'),
      CodeElement: z
        .array(z.string())
        .optional()
        .describe('Filter by code element types (function, class, etc.)'),
    })
    .optional()
    .describe('Optional filters to narrow search results'),
  top: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe('Number of results to return (default: 100, max: 1000)'),
  skip: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of results to skip for pagination (default: 0)'),
  includeSnippet: z
    .boolean()
    .default(true)
    .describe('Whether to include code snippets in results (default: true)'),
  includeContent: z
    .boolean()
    .default(true)
    .describe(
      'Whether to include full file content in results (default: true)',
    ),
});

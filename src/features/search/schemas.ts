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

/**
 * Schema for searching wiki pages in Azure DevOps projects
 */
export const SearchWikiSchema = z.object({
  searchText: z.string().describe('The text to search for in wikis'),
  projectId: z.string().describe('The ID or name of the project to search in'),
  filters: z
    .object({
      Project: z
        .array(z.string())
        .optional()
        .describe('Filter by project names'),
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
  includeFacets: z
    .boolean()
    .default(true)
    .describe('Whether to include faceting in results (default: true)'),
});

/**
 * Schema for searching work items in Azure DevOps projects
 */
export const SearchWorkItemsSchema = z.object({
  searchText: z.string().describe('The text to search for in work items'),
  projectId: z.string().describe('The ID or name of the project to search in'),
  filters: z
    .object({
      'System.TeamProject': z
        .array(z.string())
        .optional()
        .describe('Filter by project names'),
      'System.WorkItemType': z
        .array(z.string())
        .optional()
        .describe('Filter by work item types (Bug, Task, User Story, etc.)'),
      'System.State': z
        .array(z.string())
        .optional()
        .describe('Filter by work item states (New, Active, Closed, etc.)'),
      'System.AssignedTo': z
        .array(z.string())
        .optional()
        .describe('Filter by assigned users'),
      'System.AreaPath': z
        .array(z.string())
        .optional()
        .describe('Filter by area paths'),
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
  includeFacets: z
    .boolean()
    .default(true)
    .describe('Whether to include faceting in results (default: true)'),
  orderBy: z
    .array(
      z.object({
        field: z.string().describe('Field to sort by'),
        sortOrder: z.enum(['ASC', 'DESC']).describe('Sort order (ASC/DESC)'),
      }),
    )
    .optional()
    .describe('Options for sorting search results'),
});

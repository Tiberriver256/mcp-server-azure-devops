import { z } from 'zod';

/**
 * Schema for listing project iteration hierarchy nodes
 */
export const ListIterationsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)',
    ),
  organizationId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the organization (defaults to configured organization)',
    ),
  path: z
    .string()
    .optional()
    .describe(
      'Optional relative iteration path beneath the project root (e.g., "Release 1")',
    ),
  depth: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .default(5)
    .describe(
      'Depth of child iteration nodes to return (0-10; defaults to 5 so child iterations are included)',
    ),
});

/**
 * Schema for listing a team's configured sprint iterations
 */
export const ListTeamIterationsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)',
    ),
  teamId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the team (defaults to the project default team)',
    ),
  organizationId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the organization (defaults to configured organization)',
    ),
  timeframe: z
    .enum(['past', 'current', 'future'])
    .optional()
    .describe(
      'Filter team iterations by timeframe ("past", "current", or "future")',
    ),
});

/**
 * Schema for getting a team's sprint/board settings and optional area paths
 */
export const GetTeamSettingsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)',
    ),
  teamId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the team (defaults to the project default team)',
    ),
  organizationId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the organization (defaults to configured organization)',
    ),
  includeAreaPaths: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Include the team default and allowed area paths from team field values (default: false)',
    ),
});

/**
 * Schema for getting work items assigned to a specific team iteration
 */
export const GetIterationWorkItemsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)',
    ),
  teamId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the team (defaults to the project default team)',
    ),
  organizationId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the organization (defaults to configured organization)',
    ),
  iterationId: z
    .string()
    .min(1)
    .describe(
      'The iteration UUID (identifier from list_iterations or id from list_team_iterations; integer IDs are not accepted)',
    ),
  includeWorkItemDetails: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, hydrate full work item details in batches of up to 200 items (default: false)',
    ),
  fields: z
    .array(z.string())
    .optional()
    .describe(
      'Optional list of work item field reference names to retrieve when includeWorkItemDetails is true',
    ),
});

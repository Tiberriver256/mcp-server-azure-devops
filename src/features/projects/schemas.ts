import { z } from 'zod';

/**
 * Schema for getting a project
 */
export const GetProjectSchema = z.object({
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
});

/**
 * Schema for getting detailed project information
 */
export const GetProjectDetailsSchema = z.object({
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
  includeProcess: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include process information in the project result'),
  includeWorkItemTypes: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include work item types and their structure'),
  includeFields: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include field information for work item types'),
  includeTeams: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include associated teams in the project result'),
  expandTeamIdentity: z
    .boolean()
    .optional()
    .default(false)
    .describe('Expand identity information in the team objects'),
});

/**
 * Schema for listing projects
 */
export const ListProjectsSchema = z.object({
  organizationId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the organization (defaults to configured organization)',
    ),
  stateFilter: z
    .number()
    .optional()
    .describe(
      'Filter on team project state (0: all, 1: well-formed, 2: creating, 3: deleting, 4: new)',
    ),
  top: z.number().optional().describe('Maximum number of projects to return'),
  skip: z.number().optional().describe('Number of projects to skip'),
  continuationToken: z
    .number()
    .optional()
    .describe('Gets the projects after the continuation token provided'),
});

/**
 * Schema for listing teams in a project or across all projects
 */
export const ListTeamsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the project to list teams for (defaults to AZURE_DEVOPS_DEFAULT_PROJECT unless allProjects is true; lists org/collection-wide teams when omitted and no default project is configured)',
    ),
  organizationId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the organization (defaults to configured organization)',
    ),
  allProjects: z
    .boolean()
    .optional()
    .describe(
      'If true, list teams across all projects in the organization or collection (ignores projectId and AZURE_DEVOPS_DEFAULT_PROJECT)',
    ),
  mine: z
    .boolean()
    .optional()
    .describe(
      'If true, return only teams the authenticated user is a member of',
    ),
  top: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(100)
    .describe('Maximum number of teams to return (1-1000, default: 100)'),
  skip: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Number of teams to skip (non-negative integer)'),
  expandIdentity: z
    .boolean()
    .optional()
    .describe(
      'If true, expand identity information in the returned team objects (supported on Azure DevOps Server 2020+ and Services; automatically omitted when unset, false, or unsupported)',
    ),
});

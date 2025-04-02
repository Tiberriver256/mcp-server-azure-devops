import { z } from 'zod';

/**
 * Schema for getting a project
 */
export const GetProjectSchema = z.object({
  projectId: z.string().describe('The ID or name of the project'),
});

/**
 * Schema for getting detailed project information
 */
export const GetProjectDetailsSchema = z.object({
  projectId: z.string().describe('The ID or name of the project'),
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

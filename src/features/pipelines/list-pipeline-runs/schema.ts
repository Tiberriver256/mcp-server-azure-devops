import { z } from 'zod';
import { defaultProject } from '../../../utils/environment';

export const ListPipelineRunsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  pipelineId: z.number().int().min(1).describe('Pipeline numeric ID'),
  top: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe('Maximum number of runs to return (1-100)'),
  continuationToken: z
    .string()
    .optional()
    .describe('Continuation token for pagination'),
  branch: z
    .string()
    .optional()
    .describe('Branch to filter by (e.g., "main" or "refs/heads/main")'),
  state: z
    .enum(['notStarted', 'inProgress', 'completed', 'cancelling', 'postponed'])
    .optional()
    .describe('Filter by current run state'),
  result: z
    .enum(['succeeded', 'partiallySucceeded', 'failed', 'canceled', 'none'])
    .optional()
    .describe('Filter by final run result'),
  createdFrom: z
    .string()
    .datetime()
    .optional()
    .describe('Filter runs created at or after this time (ISO 8601)'),
  createdTo: z
    .string()
    .datetime()
    .optional()
    .describe('Filter runs created at or before this time (ISO 8601)'),
  orderBy: z
    .enum(['createdDate desc', 'createdDate asc'])
    .default('createdDate desc')
    .describe('Sort order for run creation date'),
});

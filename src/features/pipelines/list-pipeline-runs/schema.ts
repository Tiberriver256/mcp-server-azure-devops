import { z } from 'zod';

/**
 * Schema for list-pipeline-runs input
 */
export const ListPipelineRunsSchema = z.object({
  projectId: z.string().optional().describe('The ID or name of the project'),
  pipelineId: z
    .number()
    .int()
    .positive()
    .describe('The ID of the pipeline to get runs for'),
  top: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe('Maximum number of runs to return (default: 50, max: 1000)'),
});

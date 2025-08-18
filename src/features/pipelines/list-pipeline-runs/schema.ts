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
});

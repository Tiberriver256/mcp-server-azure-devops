import { z } from 'zod';

/**
 * Schema for get-pipeline-run input
 */
export const GetPipelineRunSchema = z.object({
  projectId: z.string().optional().describe('The ID or name of the project'),
  pipelineId: z.number().int().positive().describe('The ID of the pipeline'),
  runId: z.number().int().positive().describe('The ID of the run'),
});

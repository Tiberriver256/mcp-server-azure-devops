import { z } from 'zod';

/**
 * Schema for cancelling a pipeline run
 */
export const CancelPipelineRunSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('The ID or name of the project (Default: from environment)'),
  pipelineId: z.number().int().positive().describe('The ID of the pipeline'),
  runId: z.number().int().positive().describe('The ID of the run to cancel'),
  reason: z
    .string()
    .optional()
    .describe('Optional reason for cancelling the run'),
});

export type CancelPipelineRunInput = z.infer<typeof CancelPipelineRunSchema>;

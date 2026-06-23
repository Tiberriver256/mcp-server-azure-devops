import { z } from 'zod';
import { projectIdField } from '../../../shared/schemas';

export const GetPipelineRunSchema = z.object({
  projectId: projectIdField,
  runId: z.number().int().min(1).describe('Pipeline run identifier'),
  pipelineId: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Optional guard; validates the run belongs to this pipeline'),
});

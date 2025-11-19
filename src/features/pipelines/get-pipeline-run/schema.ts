import { z } from 'zod';
import { defaultProject } from '../../../utils/environment';

export const GetPipelineRunSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  runId: z.number().int().min(1).describe('Pipeline run identifier'),
  pipelineId: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Optional guard; validates the run belongs to this pipeline'),
});

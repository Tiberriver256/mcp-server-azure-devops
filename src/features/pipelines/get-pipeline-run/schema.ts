import { z } from 'zod';
import { defaultProject } from '../../../utils/environment';
import {
  buildNumberField,
  pipelineNameField,
  refineRunReference,
} from '../run-reference';

export const GetPipelineRunSchema = z
  .object({
    projectId: z
      .string()
      .optional()
      .describe(`The ID or name of the project (Default: ${defaultProject})`),
    runId: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Pipeline run (build) ID. Alternatively provide buildNumber together with pipelineName or pipelineId',
      ),
    buildNumber: buildNumberField,
    pipelineId: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Optional pipeline numeric ID; scopes buildNumber lookups and validates the run belongs to this pipeline',
      ),
    pipelineName: pipelineNameField,
  })
  .superRefine(refineRunReference);

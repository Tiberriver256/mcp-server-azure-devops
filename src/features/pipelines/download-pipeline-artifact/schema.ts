import { z } from 'zod';
import { defaultProject } from '../../../utils/environment';
import {
  buildNumberField,
  pipelineNameField,
  refineRunReference,
} from '../run-reference';

export const DownloadPipelineArtifactSchema = z
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
    artifactPath: z
      .string()
      .min(1)
      .describe(
        'Path to the desired file inside the artifact (format: <artifactName>/<path/to/file>)',
      ),
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

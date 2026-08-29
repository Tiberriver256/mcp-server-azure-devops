import { z } from 'zod';
import { projectIdField } from '../../../shared/schemas';

export const DownloadPipelineArtifactSchema = z.object({
  projectId: projectIdField,
  runId: z.number().int().min(1).describe('Pipeline run identifier'),
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
    .describe('Optional guard; validates the run belongs to this pipeline'),
});

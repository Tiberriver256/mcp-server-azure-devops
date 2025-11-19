import { z } from 'zod';
import { defaultProject } from '../../../utils/environment';

export const GetPipelineTimelineSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  runId: z.number().int().min(1).describe('Run identifier'),
  timelineId: z
    .string()
    .optional()
    .describe(
      'Optional timeline identifier to select a specific timeline record',
    ),
  pipelineId: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Optional pipeline numeric ID for reference only'),
  state: z
    .union([
      z.enum(['pending', 'inProgress', 'completed']),
      z.array(z.enum(['pending', 'inProgress', 'completed'])),
    ])
    .optional()
    .describe(
      'Optional state filter (single value or array) applied to returned timeline records',
    ),
  result: z
    .union([
      z.enum([
        'succeeded',
        'succeededWithIssues',
        'failed',
        'canceled',
        'skipped',
        'abandoned',
      ]),
      z.array(
        z.enum([
          'succeeded',
          'succeededWithIssues',
          'failed',
          'canceled',
          'skipped',
          'abandoned',
        ]),
      ),
    ])
    .optional()
    .describe(
      'Optional result filter (single value or array) applied to returned timeline records',
    ),
});

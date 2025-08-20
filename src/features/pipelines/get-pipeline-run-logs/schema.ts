import { z } from 'zod';

export const GetPipelineRunLogsSchema = z.object({
  projectId: z.string().optional().describe('The ID or name of the project'),
  pipelineId: z.number().int().positive().describe('The ID of the pipeline'),
  runId: z.number().int().positive().describe('The ID of the run'),
  logId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Optional: The ID of a specific log to retrieve. If not provided, all logs are listed',
    ),
  fetchContent: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to fetch the actual log content (default: false)'),
  expand: z
    .enum(['none', 'signedContent'])
    .optional()
    .default('signedContent')
    .describe(
      'The level of detail to include (default: signedContent for URLs to download logs)',
    ),
});

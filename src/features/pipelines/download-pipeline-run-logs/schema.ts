import { z } from 'zod';

/**
 * Schema for download pipeline run logs tool
 */
export const DownloadPipelineRunLogsSchema = z.object({
  projectId: z.string().optional().describe('The ID or name of the project'),
  pipelineId: z.number().int().positive().describe('The ID of the pipeline'),
  runId: z.number().int().positive().describe('The ID of the run'),
  outputDir: z
    .string()
    .optional()
    .describe(
      'Output directory for downloaded logs (defaults to current directory)',
    ),
});

export type DownloadPipelineRunLogsInput = z.infer<
  typeof DownloadPipelineRunLogsSchema
>;

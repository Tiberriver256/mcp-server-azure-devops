import { z } from 'zod';

/**
 * Schema for getting pipeline log content directly
 */
export const GetPipelineLogContentSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('The ID or name of the project (Default: from environment)'),
  pipelineId: z.number().int().positive().describe('The ID of the pipeline'),
  runId: z.number().int().positive().describe('The ID of the run'),
  logId: z
    .number()
    .int()
    .positive()
    .describe('The ID of the specific log to retrieve'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Line number to start reading from (0-based)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(5000)
    .optional()
    .describe('Maximum number of lines to return (default: 1000, max: 5000)'),
  includeDownloadPath: z
    .boolean()
    .optional()
    .describe('Whether to include the local download path in the response'),
});

export type GetPipelineLogContentInput = z.infer<
  typeof GetPipelineLogContentSchema
>;

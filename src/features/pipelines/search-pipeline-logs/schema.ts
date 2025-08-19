import { z } from 'zod';

/**
 * Schema for searching pipeline logs
 */
export const SearchPipelineLogsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('The ID or name of the project (Default: from environment)'),
  pipelineId: z.number().int().positive().describe('The ID of the pipeline'),
  runId: z.number().int().positive().describe('The ID of the run'),
  pattern: z.string().describe('Regular expression pattern to search for'),
  logIds: z
    .array(z.number().int().positive())
    .optional()
    .describe('Specific log IDs to search (searches all if not specified)'),
  ignoreCase: z
    .boolean()
    .optional()
    .default(false)
    .describe('Case-insensitive search'),
  invertMatch: z
    .boolean()
    .optional()
    .default(false)
    .describe('Show lines that do NOT match the pattern'),
  beforeContext: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe('Number of lines to show before each match'),
  afterContext: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe('Number of lines to show after each match'),
  maxMatches: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Maximum number of matches to return (default: 100)'),
});

export type SearchPipelineLogsInput = z.infer<typeof SearchPipelineLogsSchema>;

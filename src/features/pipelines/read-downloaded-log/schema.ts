import { z } from 'zod';

/**
 * Schema for reading a downloaded log file
 */
export const ReadDownloadedLogSchema = z.object({
  downloadPath: z
    .string()
    .describe('The path returned by download_pipeline_run_logs'),
  fileName: z
    .string()
    .describe(
      'The name of the file to read (e.g., "log-001.txt" or "summary.json")',
    ),
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
});

export type ReadDownloadedLogInput = z.infer<typeof ReadDownloadedLogSchema>;

/**
 * Schema for listing downloaded log files
 */
export const ListDownloadedLogsSchema = z.object({
  downloadPath: z
    .string()
    .describe('The path returned by download_pipeline_run_logs'),
});

export type ListDownloadedLogsInput = z.infer<typeof ListDownloadedLogsSchema>;

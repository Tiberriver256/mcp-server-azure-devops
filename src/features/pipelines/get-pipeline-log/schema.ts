import { z } from 'zod';
import { projectIdField } from '../../../shared/schemas';

export const GetPipelineLogSchema = z.object({
  projectId: projectIdField,
  runId: z.number().int().min(1).describe('Pipeline run identifier'),
  logId: z
    .number()
    .int()
    .min(1)
    .describe('Log identifier from the timeline record'),
  format: z
    .enum(['plain', 'json'])
    .optional()
    .describe('Optional format for the log contents (plain or json)'),
  startLine: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional starting line number for the log segment'),
  endLine: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional ending line number for the log segment'),
  pipelineId: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Optional pipeline numeric ID for reference only'),
});

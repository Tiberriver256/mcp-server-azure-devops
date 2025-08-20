import { z } from 'zod';

/**
 * Schema for getting code coverage summary
 */
export const GetCodeCoverageSchema = z.object({
  projectId: z.string().optional().describe('Project ID or name'),
  buildId: z.number().describe('Build ID'),
  flags: z.number().optional().describe('Coverage data flags'),
});

/**
 * Schema for getting detailed code coverage
 */
export const GetCodeCoverageDetailsSchema = z.object({
  projectId: z.string().optional().describe('Project ID or name'),
  buildId: z.number().describe('Build ID'),
  flags: z.number().optional().describe('Coverage data flags'),
  top: z.number().optional().describe('Number of results'),
  continuationToken: z.string().optional().describe('Continuation token'),
});

export type GetCodeCoverageInput = z.infer<typeof GetCodeCoverageSchema>;
export type GetCodeCoverageDetailsInput = z.infer<
  typeof GetCodeCoverageDetailsSchema
>;

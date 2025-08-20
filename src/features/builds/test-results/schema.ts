import { z } from 'zod';

/**
 * Schema for getting test results for a build
 */
export const GetTestResultsSchema = z.object({
  projectId: z.string().optional().describe('Project ID or name'),
  buildId: z.number().describe('Build ID'),
  publishContext: z.string().optional().describe('Publish context GUID'),
  top: z.number().optional().describe('Number of results'),
  skip: z.number().optional().describe('Number to skip'),
  outcomes: z.array(z.string()).optional().describe('Filter by outcomes'),
});

/**
 * Schema for getting test run statistics
 */
export const GetTestRunStatsSchema = z.object({
  projectId: z.string().optional().describe('Project ID or name'),
  buildId: z.number().describe('Build ID'),
});

export type GetTestResultsInput = z.infer<typeof GetTestResultsSchema>;
export type GetTestRunStatsInput = z.infer<typeof GetTestRunStatsSchema>;

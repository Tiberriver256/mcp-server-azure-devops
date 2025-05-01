import { z } from 'zod';

/**
 * Schema for get_toolset_tools request
 */
export const GetToolsetToolsSchema = z.object({
  toolset: z.string().describe('The name of the toolset to inspect'),
});

/**
 * Schema for enable_toolset request
 */
export const EnableToolsetSchema = z.object({
  toolset: z.string().describe('The name of the toolset to enable'),
});

/**
 * Schema for list_available_toolsets request
 * No parameters needed
 */
export const ListAvailableToolsetsSchema = z.object({});

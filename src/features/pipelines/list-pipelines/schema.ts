import { z } from 'zod';

/**
 * Schema for the listPipelines function
 */
export const ListPipelinesSchema = z.object({
  // The project to list pipelines from
  projectId: z
    .string()
    .optional()
    .describe(
      'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)',
    ),
  // Maximum number of pipelines to return
  top: z.number().optional().describe('Maximum number of pipelines to return'),
  // Order by field and direction
  orderBy: z
    .string()
    .optional()
    .describe('Order by field and direction (e.g., "createdDate desc")'),
});

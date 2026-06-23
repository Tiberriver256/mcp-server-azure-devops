import { z } from 'zod';
import { projectIdField } from '../../../shared/schemas';

/**
 * Schema for the listPipelines function
 */
export const ListPipelinesSchema = z.object({
  // The project to list pipelines from
  projectId: projectIdField,
  // Maximum number of pipelines to return
  top: z.number().optional().describe('Maximum number of pipelines to return'),
  // Order by field and direction
  orderBy: z
    .string()
    .optional()
    .describe('Order by field and direction (e.g., "createdDate desc")'),
});

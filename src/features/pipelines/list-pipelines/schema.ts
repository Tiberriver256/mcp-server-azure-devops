import { z } from 'zod';

/**
 * Schema for the listPipelines function
 */
export const ListPipelinesSchema = z.object({
  // The project to list pipelines from
  projectId: z.string().optional(),
  // Maximum number of pipelines to return
  top: z.number().optional(),
  // Order by field and direction
  orderBy: z.string().optional(),
});

import { z } from 'zod';
import { pipelineNameField, refinePipelineReference } from '../run-reference';

/**
 * Schema for the getPipeline function
 */
export const GetPipelineSchema = z
  .object({
    // The project containing the pipeline
    projectId: z
      .string()
      .optional()
      .describe(
        'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)',
      ),
    // The ID of the pipeline to retrieve
    pipelineId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'The numeric ID of the pipeline to retrieve. Alternatively provide pipelineName',
      ),
    pipelineName: pipelineNameField,
    // The version of the pipeline to retrieve
    pipelineVersion: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'The version of the pipeline to retrieve (latest if not specified)',
      ),
  })
  .superRefine(refinePipelineReference);

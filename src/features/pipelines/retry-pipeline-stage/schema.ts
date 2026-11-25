import { z } from 'zod';
import {
  buildNumberField,
  pipelineNameField,
  refineRunReference,
} from '../run-reference.ts';

export const STAGE_ACTION_STATES = ['retry', 'cancel', 'run'] as const;

export const RetryPipelineStageSchema = z
  .object({
    projectId: z
      .string()
      .optional()
      .describe(
        'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)',
      ),
    runId: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Pipeline run (build) ID. Alternatively provide buildNumber together with pipelineName or pipelineId',
      ),
    buildNumber: buildNumberField,
    pipelineId: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Optional pipeline numeric ID; scopes buildNumber lookups'),
    pipelineName: pipelineNameField,
    stageRefName: z
      .string()
      .trim()
      .min(1)
      .describe(
        'Reference name (identifier) of the pipeline stage to update (e.g. "Test", "Build", "Deploy")',
      ),
    state: z
      .enum(STAGE_ACTION_STATES)
      .optional()
      .describe(
        'Stage update action: "retry" (default, retries a failed/completed stage), "cancel" (cancels an in-progress stage), or "run" (runs a manual/deferred stage).',
      ),
    forceRetryAllJobs: z
      .boolean()
      .optional()
      .describe(
        'When retrying a stage, set true to re-run all jobs including previously succeeded jobs; false (default) retries only failed or canceled jobs.',
      ),
    retryDependencies: z
      .boolean()
      .optional()
      .describe(
        'Optional flag controlling whether dependent downstream stages are also retried. Only sent when explicitly specified.',
      ),
  })
  .superRefine(refineRunReference);

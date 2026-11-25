import { z } from 'zod';
import {
  buildNumberField,
  pipelineNameField,
  refineRunReference,
} from '../run-reference.ts';

export const TEST_OUTCOME_NAMES = [
  'Unspecified',
  'None',
  'Passed',
  'Failed',
  'Inconclusive',
  'Timeout',
  'Aborted',
  'Blocked',
  'NotExecuted',
  'Warning',
  'Error',
  'NotApplicable',
  'Paused',
  'InProgress',
  'NotImpacted',
] as const;

export const RESULT_DETAILS_VALUES = [
  'None',
  'Iterations',
  'WorkItems',
  'SubResults',
  'Point',
] as const;

const TestOutcomeValueSchema = z.union([
  z.enum(TEST_OUTCOME_NAMES),
  z.number().int().min(0).max(14),
]);

export const GetBuildTestResultsSchema = z
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
    outcomes: z
      .union([z.literal('all'), z.array(TestOutcomeValueSchema).min(1)])
      .optional()
      .describe(
        'Test outcome filter: array of TestOutcome names (e.g. ["Failed", "Aborted", "Timeout", "Error"], ["Passed"]), numeric outcome codes (0-14), or "all". Defaults to failure-focused outcomes: ["Failed", "Aborted", "Timeout", "Error"].',
      ),
    detailsToInclude: z
      .enum(RESULT_DETAILS_VALUES)
      .optional()
      .describe(
        'Optional detail level per test result ("None", "Iterations", "WorkItems", "SubResults", "Point"). Defaults to "None". Non-None values cap per-run API $top to 200.',
      ),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        'Maximum total test results returned across all test runs for this build (1-1000, default 100). Per-run API $top is capped at 200 when detailsToInclude is not "None" and 1000 otherwise.',
      ),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Optional number of test results to skip per test run for pagination (default 0).',
      ),
    topRuns: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'Maximum number of test runs to inspect for the build (1-200, default 50).',
      ),
  })
  .superRefine(refineRunReference);

import { z } from 'zod';
import { defaultProject } from '../../utils/environment';

const projectId = z
  .string()
  .min(1)
  .optional()
  .describe(`The ID or name of the project (Default: ${defaultProject})`);

const positiveId = z.number().int().positive();

export const ListTestPlansSchema = z.object({
  projectId,
  owner: z.string().min(1).optional(),
  includePlanDetails: z.boolean().optional().default(false),
  filterActivePlans: z.boolean().optional().default(true),
  continuationToken: z.string().min(1).optional(),
});

export const ListTestSuitesSchema = z.object({
  projectId,
  planId: positiveId.describe('The test plan ID'),
  includeChildren: z
    .boolean()
    .optional()
    .default(true)
    .describe('Return the suite hierarchy instead of only root suites'),
  continuationToken: z.string().min(1).optional(),
});

export const ListSuiteTestCasesSchema = z.object({
  projectId,
  planId: positiveId.describe('The test plan ID'),
  suiteId: positiveId.describe('The test suite ID'),
  continuationToken: z.string().min(1).optional(),
});

export const ListTestPointsSchema = z.object({
  projectId,
  planId: positiveId.describe('The test plan ID'),
  suiteId: positiveId.describe('The test suite ID'),
  testCaseId: positiveId.optional(),
  skip: z.number().int().min(0).optional().default(0),
  top: z.number().int().min(1).max(1000).optional().default(200),
});

export const CreateTestRunSchema = z.object({
  projectId,
  name: z.string().min(1).max(256).describe('A descriptive name for the run'),
  planId: positiveId.describe('The test plan ID'),
  pointIds: z
    .array(positiveId)
    .min(1)
    .describe('Test point IDs selected from list_test_points'),
  comment: z.string().max(4000).optional(),
});

export const ListTestResultsSchema = z.object({
  projectId,
  runId: positiveId.describe('The test run ID'),
  skip: z.number().int().min(0).optional().default(0),
  top: z.number().int().min(1).max(1000).optional().default(200),
});

const TestOutcomeSchema = z.enum([
  'Passed',
  'Failed',
  'Blocked',
  'NotApplicable',
  'Inconclusive',
  'Paused',
  'NotExecuted',
]);

export const UpdateTestResultsSchema = z.object({
  projectId,
  runId: positiveId.describe('The test run ID'),
  results: z
    .array(
      z.object({
        id: positiveId.describe('The result ID from list_test_results'),
        outcome: TestOutcomeSchema.describe('The observed outcome'),
        comment: z.string().max(4000).optional(),
        errorMessage: z.string().max(16000).optional(),
        failureType: z.string().max(256).optional(),
        stackTrace: z.string().max(16000).optional(),
        state: z.enum(['Completed', 'InProgress', 'Pending']).optional(),
      }),
    )
    .min(1),
});

export const CompleteTestRunSchema = z.object({
  projectId,
  runId: positiveId.describe('The test run ID'),
  comment: z.string().max(4000).optional(),
  completedDate: z.string().datetime().optional(),
});

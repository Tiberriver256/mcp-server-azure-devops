import { z } from 'zod';
import { isValidIsoDateString, parseStrictIsoDate } from './helpers';

const projectIdField = z
  .string()
  .optional()
  .describe(
    'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT; required if unset)',
  );

const positiveIntId = z.number().int().positive();

const isoDateString = z.string().refine(isValidIsoDateString, {
  message:
    'Must be a valid ISO 8601 date or date-time string (e.g., "2026-06-01" or "2026-06-01T00:00:00Z")',
});

const suiteExpandField = z
  .enum(['none', 'children', 'defaultTesters'])
  .optional()
  .describe(
    'Optional details to expand: "none", "children", or "defaultTesters"',
  );

export const ListTestPlansSchema = z.object({
  projectId: projectIdField,
  owner: z
    .string()
    .optional()
    .describe('Optional filter by test plan owner ID or display name'),
  filterActivePlans: z
    .boolean()
    .optional()
    .describe(
      'Filter to only active test plans (recommended for large projects)',
    ),
  includePlanDetails: z
    .boolean()
    .optional()
    .describe('Include full plan details in each returned test plan'),
  continuationToken: z
    .string()
    .optional()
    .describe('Continuation token from a previous page'),
});

export const GetTestPlanSchema = z.object({
  projectId: projectIdField,
  planId: positiveIntId.describe('The numeric ID of the test plan'),
});

export const CreateTestPlanSchema = z
  .object({
    projectId: projectIdField,
    name: z.string().trim().min(1).describe('Name of the new test plan'),
    iteration: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Iteration path for the test plan (e.g., "MyProject\\\\Sprint 1"). Defaults to projectId when omitted (specify explicitly if projectId is a project GUID).',
      ),
    areaPath: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Area path for the test plan'),
    description: z.string().optional().describe('Description of the test plan'),
    startDate: isoDateString
      .optional()
      .describe('Start date in ISO 8601 format (e.g., "2026-06-01")'),
    endDate: isoDateString
      .optional()
      .describe('End date in ISO 8601 format (e.g., "2026-06-30")'),
    state: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('State of the test plan (e.g., "Active", "Inactive")'),
    ownerId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('User ID (GUID) of the test plan owner'),
    buildId: positiveIntId
      .optional()
      .describe('Optional build ID associated with the test plan'),
  })
  .superRefine((data, ctx) => {
    if (data.startDate && data.endDate) {
      const start = parseStrictIsoDate(data.startDate);
      const end = parseStrictIsoDate(data.endDate);
      if (start && end && end.getTime() < start.getTime()) {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'endDate must be on or after startDate',
        });
      }
    }
  });

export const ListTestSuitesSchema = z.object({
  projectId: projectIdField,
  planId: positiveIntId.describe('The numeric ID of the test plan'),
  expand: suiteExpandField,
  asTreeView: z
    .boolean()
    .optional()
    .describe('Return suites nested as a hierarchy instead of a flat list'),
  continuationToken: z
    .string()
    .optional()
    .describe('Continuation token from a previous page'),
});

export const GetTestSuiteSchema = z.object({
  projectId: projectIdField,
  planId: positiveIntId.describe('The numeric ID of the test plan'),
  suiteId: positiveIntId.describe('The numeric ID of the test suite'),
  expand: suiteExpandField,
});

export const CreateTestSuiteSchema = z
  .object({
    projectId: projectIdField,
    planId: positiveIntId.describe('The numeric ID of the parent test plan'),
    name: z.string().trim().min(1).describe('Name of the new test suite'),
    suiteType: z
      .enum(['staticTestSuite', 'requirementTestSuite', 'dynamicTestSuite'])
      .default('staticTestSuite')
      .optional()
      .describe(
        'Suite type: "staticTestSuite" (default), "requirementTestSuite" (requires requirementId), or "dynamicTestSuite" (requires queryString)',
      ),
    parentSuiteId: positiveIntId
      .optional()
      .describe(
        'Parent static suite ID. When omitted, automatically resolves and uses the test plan rootSuite ID.',
      ),
    requirementId: positiveIntId
      .optional()
      .describe(
        'Requirement / User Story / PBI work item ID (required when suiteType is "requirementTestSuite")',
      ),
    queryString: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'WIQL query returning Test Case work items (required when suiteType is "dynamicTestSuite")',
      ),
    inheritDefaultConfigurations: z
      .boolean()
      .optional()
      .describe(
        'Whether the suite inherits default configurations from its parent',
      ),
  })
  .superRefine((data, ctx) => {
    if (
      data.suiteType === 'requirementTestSuite' &&
      data.requirementId === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['requirementId'],
        message:
          'requirementId is required when suiteType is "requirementTestSuite"',
      });
    }
    if (data.suiteType === 'dynamicTestSuite' && !data.queryString) {
      ctx.addIssue({
        code: 'custom',
        path: ['queryString'],
        message: 'queryString is required when suiteType is "dynamicTestSuite"',
      });
    }
  });

export const ListSuiteTestCasesSchema = z.object({
  projectId: projectIdField,
  planId: positiveIntId.describe('The numeric ID of the test plan'),
  suiteId: positiveIntId.describe('The numeric ID of the test suite'),
  testIds: z
    .array(positiveIntId)
    .optional()
    .describe('Optional filter by specific Test Case work item IDs'),
  configurationIds: z
    .array(positiveIntId)
    .optional()
    .describe('Optional filter by test configuration IDs'),
  witFields: z
    .array(z.string().trim().min(1))
    .optional()
    .describe(
      'Optional work item fields to include (e.g., ["System.Title", "System.State", "Microsoft.VSTS.TCM.Steps"])',
    ),
  expand: z
    .boolean()
    .optional()
    .describe(
      'Include full work item field details (defaults to true in Azure DevOps)',
    ),
  isRecursive: z
    .boolean()
    .optional()
    .describe(
      'Include test cases from child suites recursively (Azure DevOps Services / Server 7.1+)',
    ),
  continuationToken: z
    .string()
    .optional()
    .describe('Continuation token from a previous page'),
});

export const AddTestCasesToSuiteSchema = z.object({
  projectId: projectIdField,
  planId: positiveIntId.describe('The numeric ID of the test plan'),
  suiteId: positiveIntId.describe(
    'The numeric ID of the static or requirement-based test suite (cannot add to query-based suites)',
  ),
  testCaseIds: z
    .array(positiveIntId)
    .min(1)
    .describe(
      'Non-empty list of Test Case work item IDs to attach to the suite',
    ),
  configurationIds: z
    .array(positiveIntId)
    .optional()
    .describe(
      'Optional test configuration IDs to assign to the added test cases',
    ),
});

export const RemoveTestCasesFromSuiteSchema = z.object({
  projectId: projectIdField,
  planId: positiveIntId.describe('The numeric ID of the test plan'),
  suiteId: positiveIntId.describe(
    'The numeric ID of the static test suite (detaches test cases without deleting the underlying work items)',
  ),
  testCaseIds: z
    .array(positiveIntId)
    .min(1)
    .describe(
      'Non-empty list of Test Case work item IDs to remove from the suite',
    ),
});

export const TestCaseStepSchema = z.object({
  action: z
    .string()
    .trim()
    .min(1)
    .describe('Action to perform in this test step'),
  expectedResult: z
    .string()
    .optional()
    .describe(
      'Expected outcome for this step (creates a ValidateStep when provided)',
    ),
});

export const CreateTestCaseSchema = z
  .object({
    projectId: projectIdField,
    title: z
      .string()
      .trim()
      .min(1)
      .describe('Title of the Test Case work item'),
    description: z
      .string()
      .optional()
      .describe('Optional description for the Test Case (HTML format)'),
    steps: z
      .array(TestCaseStepSchema)
      .optional()
      .describe(
        'Structured test steps (action + optional expectedResult) automatically encoded as Microsoft.VSTS.TCM.Steps XML',
      ),
    priority: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe('Priority (1-4)'),
    areaPath: z.string().trim().min(1).optional().describe('Area path'),
    iterationPath: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Iteration path'),
    assignedTo: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Assignee email or display name'),
    tags: z
      .array(z.string().trim().min(1))
      .optional()
      .describe('Tags to apply'),
    requirementId: positiveIntId
      .optional()
      .describe(
        'Optional requirement / User Story / PBI work item ID to link via Microsoft.VSTS.Common.TestedBy-Reverse ("Tests")',
      ),
    planId: positiveIntId
      .optional()
      .describe(
        'Optional test plan ID to immediately attach the created Test Case to (must be paired with suiteId)',
      ),
    suiteId: positiveIntId
      .optional()
      .describe(
        'Optional test suite ID to immediately attach the created Test Case to (must be paired with planId)',
      ),
    configurationIds: z
      .array(positiveIntId)
      .optional()
      .describe(
        'Optional test configuration IDs to assign when attaching to a suite (requires planId and suiteId)',
      ),
  })
  .superRefine((data, ctx) => {
    const hasPlan = data.planId !== undefined;
    const hasSuite = data.suiteId !== undefined;
    if (hasPlan !== hasSuite) {
      ctx.addIssue({
        code: 'custom',
        path: [hasPlan ? 'suiteId' : 'planId'],
        message:
          'planId and suiteId must both be provided to attach the Test Case to a suite',
      });
    }
    if (data.configurationIds !== undefined && (!hasPlan || !hasSuite)) {
      ctx.addIssue({
        code: 'custom',
        path: ['configurationIds'],
        message: 'configurationIds requires both planId and suiteId',
      });
    }
  });

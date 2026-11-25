export * from './types.ts';
export * from './schemas.ts';
export * from './helpers.ts';
export * from './plans/feature.ts';
export * from './suites/feature.ts';
export * from './test-cases/feature.ts';

import { defineTool } from '../../shared/registry/tool-registry.ts';
import type { FeatureModule } from '../../shared/registry/tool-registry.ts';
import {
  AddTestCasesToSuiteSchema,
  CreateTestCaseSchema,
  CreateTestPlanSchema,
  CreateTestSuiteSchema,
  GetTestPlanSchema,
  GetTestSuiteSchema,
  ListSuiteTestCasesSchema,
  ListTestPlansSchema,
  ListTestSuitesSchema,
  RemoveTestCasesFromSuiteSchema,
} from './schemas.ts';
import { createTestPlan, getTestPlan, listTestPlans } from './plans/feature.ts';
import {
  createTestSuite,
  getTestSuite,
  listTestSuites,
} from './suites/feature.ts';
import {
  addTestCasesToSuite,
  createTestCase,
  listSuiteTestCases,
  removeTestCasesFromSuite,
} from './test-cases/feature.ts';

export const testPlansFeature: FeatureModule = {
  toolset: 'test-plans',
  tools: [
    defineTool({
      name: 'list_test_plans',
      description:
        'List test plans in a project with optional owner/active filters and continuation token pagination',
      schema: ListTestPlansSchema,
      readOnly: true,
      handler: async (ctx, args) =>
        listTestPlans(await ctx.getWebApi(), {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        }),
    }),
    defineTool({
      name: 'get_test_plan',
      description:
        'Get details of a specific test plan by ID (including its rootSuite ID)',
      schema: GetTestPlanSchema,
      readOnly: true,
      handler: async (ctx, args) =>
        getTestPlan(await ctx.getWebApi(), {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        }),
    }),
    defineTool({
      name: 'create_test_plan',
      description:
        'Create a new test plan in a project (requires Basic + Test Plans license and Test Management write permission)',
      schema: CreateTestPlanSchema,
      readOnly: false,
      handler: async (ctx, args) =>
        createTestPlan(await ctx.getWebApi(), {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        }),
    }),
    defineTool({
      name: 'list_test_suites',
      description:
        'List test suites in a test plan as a flat list or tree hierarchy with pagination',
      schema: ListTestSuitesSchema,
      readOnly: true,
      handler: async (ctx, args) =>
        listTestSuites(await ctx.getWebApi(), {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        }),
    }),
    defineTool({
      name: 'get_test_suite',
      description:
        'Get details of a specific test suite by plan ID and suite ID',
      schema: GetTestSuiteSchema,
      readOnly: true,
      handler: async (ctx, args) =>
        getTestSuite(await ctx.getWebApi(), {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        }),
    }),
    defineTool({
      name: 'create_test_suite',
      description:
        'Create a static, requirement-based, or query-based test suite under a test plan',
      schema: CreateTestSuiteSchema,
      readOnly: false,
      handler: async (ctx, args) =>
        createTestSuite(await ctx.getWebApi(), {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        }),
    }),
    defineTool({
      name: 'list_suite_test_cases',
      description:
        'List test cases linked to a specific test suite with optional work item fields and pagination',
      schema: ListSuiteTestCasesSchema,
      readOnly: true,
      handler: async (ctx, args) =>
        listSuiteTestCases(await ctx.getWebApi(), {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        }),
    }),
    defineTool({
      name: 'add_test_cases_to_suite',
      description:
        'Attach one or more existing Test Case work items to a static or requirement-based test suite',
      schema: AddTestCasesToSuiteSchema,
      readOnly: false,
      handler: async (ctx, args) =>
        addTestCasesToSuite(await ctx.getWebApi(), {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        }),
    }),
    defineTool({
      name: 'remove_test_cases_from_suite',
      description:
        'Remove test cases from a static test suite (detaches from suite without deleting the Test Case work items)',
      schema: RemoveTestCasesFromSuiteSchema,
      readOnly: false,
      handler: async (ctx, args) =>
        removeTestCasesFromSuite(await ctx.getWebApi(), {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        }),
    }),
    defineTool({
      name: 'create_test_case',
      description:
        'Create a Test Case work item with structured steps XML, optional TestedBy requirement link, and optional immediate attachment to a test suite',
      schema: CreateTestCaseSchema,
      readOnly: false,
      handler: async (ctx, args) =>
        createTestCase(await ctx.getWebApi(), {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        }),
    }),
  ],
};

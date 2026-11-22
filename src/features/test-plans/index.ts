export * from './types';
export * from './schemas';
export * from './helpers';
export * from './plans/feature';
export * from './suites/feature';
export * from './test-cases/feature';
export * from './tool-definitions';

import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import type { WebApi } from 'azure-devops-node-api';
import type {
  RequestHandler,
  RequestIdentifier,
} from '../../shared/types/request-handler';
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
} from './schemas';
import { createTestPlan, getTestPlan, listTestPlans } from './plans/feature';
import {
  createTestSuite,
  getTestSuite,
  listTestSuites,
} from './suites/feature';
import {
  addTestCasesToSuite,
  createTestCase,
  listSuiteTestCases,
  removeTestCasesFromSuite,
} from './test-cases/feature';

const TEST_PLAN_TOOL_NAMES = new Set([
  'list_test_plans',
  'get_test_plan',
  'create_test_plan',
  'list_test_suites',
  'get_test_suite',
  'create_test_suite',
  'list_suite_test_cases',
  'add_test_cases_to_suite',
  'remove_test_cases_from_suite',
  'create_test_case',
]);

/**
 * Checks if the request is for the test-plans feature
 */
export const isTestPlansRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  return TEST_PLAN_TOOL_NAMES.has(request.params.name);
};

/**
 * Handles test-plans feature requests
 */
export const handleTestPlansRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  const args = request.params.arguments ?? {};

  switch (request.params.name) {
    case 'list_test_plans': {
      const parsed = ListTestPlansSchema.parse(args);
      const result = await listTestPlans(connection, parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_test_plan': {
      const parsed = GetTestPlanSchema.parse(args);
      const result = await getTestPlan(connection, parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'create_test_plan': {
      const parsed = CreateTestPlanSchema.parse(args);
      const result = await createTestPlan(connection, parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'list_test_suites': {
      const parsed = ListTestSuitesSchema.parse(args);
      const result = await listTestSuites(connection, parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_test_suite': {
      const parsed = GetTestSuiteSchema.parse(args);
      const result = await getTestSuite(connection, parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'create_test_suite': {
      const parsed = CreateTestSuiteSchema.parse(args);
      const result = await createTestSuite(connection, parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'list_suite_test_cases': {
      const parsed = ListSuiteTestCasesSchema.parse(args);
      const result = await listSuiteTestCases(connection, parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'add_test_cases_to_suite': {
      const parsed = AddTestCasesToSuiteSchema.parse(args);
      const result = await addTestCasesToSuite(connection, parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'remove_test_cases_from_suite': {
      const parsed = RemoveTestCasesFromSuiteSchema.parse(args);
      const result = await removeTestCasesFromSuite(connection, parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'create_test_case': {
      const parsed = CreateTestCaseSchema.parse(args);
      const result = await createTestCase(connection, parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown test plans tool: ${request.params.name}`);
  }
};

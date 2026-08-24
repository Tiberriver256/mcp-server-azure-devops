export * from './feature';
export * from './schemas';
export * from './tool-definitions';

import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import { RequestHandler, RequestIdentifier } from '../../shared/types/request-handler';
import { defaultProject } from '../../utils/environment';
import {
  CompleteTestRunSchema,
  CreateTestRunSchema,
  ListSuiteTestCasesSchema,
  ListTestPlansSchema,
  ListTestPointsSchema,
  ListTestResultsSchema,
  ListTestSuitesSchema,
  UpdateTestResultsSchema,
} from './schemas';
import {
  completeTestRun,
  createTestRun,
  listSuiteTestCases,
  listTestPlans,
  listTestPoints,
  listTestResults,
  listTestSuites,
  updateTestResults,
} from './feature';

const testManagementToolNames = [
  'list_test_plans',
  'list_test_suites',
  'list_suite_test_cases',
  'list_test_points',
  'create_test_run',
  'list_test_results',
  'update_test_results',
  'complete_test_run',
];

export const isTestManagementRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => testManagementToolNames.includes(request.params.name);

export const handleTestManagementRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  let result: unknown;

  switch (request.params.name) {
    case 'list_test_plans': {
      const args = ListTestPlansSchema.parse(request.params.arguments);
      result = await listTestPlans(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      break;
    }
    case 'list_test_suites': {
      const args = ListTestSuitesSchema.parse(request.params.arguments);
      result = await listTestSuites(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      break;
    }
    case 'list_suite_test_cases': {
      const args = ListSuiteTestCasesSchema.parse(request.params.arguments);
      result = await listSuiteTestCases(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      break;
    }
    case 'list_test_points': {
      const args = ListTestPointsSchema.parse(request.params.arguments);
      result = await listTestPoints(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      break;
    }
    case 'create_test_run': {
      const args = CreateTestRunSchema.parse(request.params.arguments);
      result = await createTestRun(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      break;
    }
    case 'list_test_results': {
      const args = ListTestResultsSchema.parse(request.params.arguments);
      result = await listTestResults(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      break;
    }
    case 'update_test_results': {
      const args = UpdateTestResultsSchema.parse(request.params.arguments);
      result = await updateTestResults(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      break;
    }
    case 'complete_test_run': {
      const args = CompleteTestRunSchema.parse(request.params.arguments);
      result = await completeTestRun(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      break;
    }
    default:
      throw new Error(`Unknown test management tool: ${request.params.name}`);
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
};

import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
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

export const testManagementTools: ToolDefinition[] = [
  {
    name: 'list_test_plans',
    description: 'List Azure Test Plans in a project',
    inputSchema: zodToJsonSchema(ListTestPlansSchema),
    mcp_enabled: true,
  },
  {
    name: 'list_test_suites',
    description: 'List suites in an Azure Test Plan',
    inputSchema: zodToJsonSchema(ListTestSuitesSchema),
    mcp_enabled: true,
  },
  {
    name: 'list_suite_test_cases',
    description: 'List Test Case work items that belong to an Azure Test Plan suite',
    inputSchema: zodToJsonSchema(ListSuiteTestCasesSchema),
    mcp_enabled: true,
  },
  {
    name: 'list_test_points',
    description:
      'List executable test points for a suite, including their test case and configuration',
    inputSchema: zodToJsonSchema(ListTestPointsSchema),
    mcp_enabled: true,
  },
  {
    name: 'create_test_run',
    description:
      'Create a manual test run for selected test points in an Azure Test Plan',
    inputSchema: zodToJsonSchema(CreateTestRunSchema),
    mcp_enabled: true,
  },
  {
    name: 'list_test_results',
    description: 'List results in an Azure Test Plan test run',
    inputSchema: zodToJsonSchema(ListTestResultsSchema),
    mcp_enabled: true,
  },
  {
    name: 'update_test_results',
    description:
      'Record Passed, Failed, Blocked, or other outcomes for results in a test run',
    inputSchema: zodToJsonSchema(UpdateTestResultsSchema),
    mcp_enabled: true,
  },
  {
    name: 'complete_test_run',
    description: 'Mark an Azure Test Plan test run as completed',
    inputSchema: zodToJsonSchema(CompleteTestRunSchema),
    mcp_enabled: true,
  },
];

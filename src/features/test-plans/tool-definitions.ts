import { toJsonSchema } from '../../shared/utils/to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
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

/**
 * List of test plans & test suites tools
 */
export const testPlansTools: ToolDefinition[] = [
  {
    name: 'list_test_plans',
    description:
      'List test plans in a project with optional owner/active filters and continuation token pagination',
    inputSchema: toJsonSchema(ListTestPlansSchema),
    readOnly: true,
  },
  {
    name: 'get_test_plan',
    description:
      'Get details of a specific test plan by ID (including its rootSuite ID)',
    inputSchema: toJsonSchema(GetTestPlanSchema),
    readOnly: true,
  },
  {
    name: 'create_test_plan',
    description:
      'Create a new test plan in a project (requires Basic + Test Plans license and Test Management write permission)',
    inputSchema: toJsonSchema(CreateTestPlanSchema),
    readOnly: false,
  },
  {
    name: 'list_test_suites',
    description:
      'List test suites in a test plan as a flat list or tree hierarchy with pagination',
    inputSchema: toJsonSchema(ListTestSuitesSchema),
    readOnly: true,
  },
  {
    name: 'get_test_suite',
    description: 'Get details of a specific test suite by plan ID and suite ID',
    inputSchema: toJsonSchema(GetTestSuiteSchema),
    readOnly: true,
  },
  {
    name: 'create_test_suite',
    description:
      'Create a static, requirement-based, or query-based test suite under a test plan',
    inputSchema: toJsonSchema(CreateTestSuiteSchema),
    readOnly: false,
  },
  {
    name: 'list_suite_test_cases',
    description:
      'List test cases linked to a specific test suite with optional work item fields and pagination',
    inputSchema: toJsonSchema(ListSuiteTestCasesSchema),
    readOnly: true,
  },
  {
    name: 'add_test_cases_to_suite',
    description:
      'Attach one or more existing Test Case work items to a static or requirement-based test suite',
    inputSchema: toJsonSchema(AddTestCasesToSuiteSchema),
    readOnly: false,
  },
  {
    name: 'remove_test_cases_from_suite',
    description:
      'Remove test cases from a static test suite (detaches from suite without deleting the Test Case work items)',
    inputSchema: toJsonSchema(RemoveTestCasesFromSuiteSchema),
    readOnly: false,
  },
  {
    name: 'create_test_case',
    description:
      'Create a Test Case work item with structured steps XML, optional TestedBy requirement link, and optional immediate attachment to a test suite',
    inputSchema: toJsonSchema(CreateTestCaseSchema),
    readOnly: false,
  },
];

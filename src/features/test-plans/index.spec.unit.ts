import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import type { WebApi } from 'azure-devops-node-api';
import {
  handleTestPlansRequest,
  isTestPlansRequest,
  testPlansTools,
} from './index';
import * as plansFeature from './plans/feature';
import * as suitesFeature from './suites/feature';
import * as testCasesFeature from './test-cases/feature';

jest.mock('./plans/feature');
jest.mock('./suites/feature');
jest.mock('./test-cases/feature');

describe('Test Plans Request Handlers', () => {
  const mockConnection = {} as WebApi;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('isTestPlansRequest', () => {
    it('identifies all 10 test-plans tools and rejects others', () => {
      expect(testPlansTools).toHaveLength(10);
      for (const tool of testPlansTools) {
        expect(
          isTestPlansRequest({
            method: 'tools/call',
            params: { name: tool.name, arguments: {} },
          } as CallToolRequest),
        ).toBe(true);
      }
      expect(
        isTestPlansRequest({
          method: 'tools/call',
          params: { name: 'get_work_item', arguments: {} },
        } as CallToolRequest),
      ).toBe(false);

      const createSuiteTool = testPlansTools.find(
        (t) => t.name === 'create_test_suite',
      );
      expect(createSuiteTool?.inputSchema.required).toEqual(['planId', 'name']);
    });
  });

  describe('handleTestPlansRequest', () => {
    it('routes all 10 tools to their respective feature handlers', async () => {
      (plansFeature.listTestPlans as jest.Mock).mockResolvedValue({
        testPlans: [],
      });
      (plansFeature.getTestPlan as jest.Mock).mockResolvedValue({ id: 1 });
      (plansFeature.createTestPlan as jest.Mock).mockResolvedValue({ id: 2 });
      (suitesFeature.listTestSuites as jest.Mock).mockResolvedValue({
        testSuites: [],
      });
      (suitesFeature.getTestSuite as jest.Mock).mockResolvedValue({ id: 10 });
      (suitesFeature.createTestSuite as jest.Mock).mockResolvedValue({
        id: 11,
      });
      (testCasesFeature.listSuiteTestCases as jest.Mock).mockResolvedValue({
        testCases: [],
      });
      (testCasesFeature.addTestCasesToSuite as jest.Mock).mockResolvedValue([]);
      (
        testCasesFeature.removeTestCasesFromSuite as jest.Mock
      ).mockResolvedValue({
        planId: 1,
        suiteId: 10,
        removedTestCaseIds: [100],
      });
      (testCasesFeature.createTestCase as jest.Mock).mockResolvedValue({
        workItem: { id: 500 },
      });

      const cases: Array<[string, Record<string, unknown>, jest.Mock]> = [
        [
          'list_test_plans',
          { projectId: 'P' },
          plansFeature.listTestPlans as jest.Mock,
        ],
        [
          'get_test_plan',
          { projectId: 'P', planId: 1 },
          plansFeature.getTestPlan as jest.Mock,
        ],
        [
          'create_test_plan',
          { projectId: 'P', name: 'Plan A' },
          plansFeature.createTestPlan as jest.Mock,
        ],
        [
          'list_test_suites',
          { projectId: 'P', planId: 1 },
          suitesFeature.listTestSuites as jest.Mock,
        ],
        [
          'get_test_suite',
          { projectId: 'P', planId: 1, suiteId: 10 },
          suitesFeature.getTestSuite as jest.Mock,
        ],
        [
          'create_test_suite',
          { projectId: 'P', planId: 1, name: 'Suite A' },
          suitesFeature.createTestSuite as jest.Mock,
        ],
        [
          'list_suite_test_cases',
          { projectId: 'P', planId: 1, suiteId: 10 },
          testCasesFeature.listSuiteTestCases as jest.Mock,
        ],
        [
          'add_test_cases_to_suite',
          { projectId: 'P', planId: 1, suiteId: 10, testCaseIds: [100] },
          testCasesFeature.addTestCasesToSuite as jest.Mock,
        ],
        [
          'remove_test_cases_from_suite',
          { projectId: 'P', planId: 1, suiteId: 10, testCaseIds: [100] },
          testCasesFeature.removeTestCasesFromSuite as jest.Mock,
        ],
        [
          'create_test_case',
          { projectId: 'P', title: 'Login works' },
          testCasesFeature.createTestCase as jest.Mock,
        ],
      ];

      for (const [name, args, fn] of cases) {
        const res = await handleTestPlansRequest(mockConnection, {
          method: 'tools/call',
          params: { name, arguments: args },
        } as CallToolRequest);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(res.content).toHaveLength(1);
      }
    });

    it('throws for unknown test-plans tool', async () => {
      await expect(
        handleTestPlansRequest(mockConnection, {
          method: 'tools/call',
          params: { name: 'unknown_test_plan_tool', arguments: {} },
        } as CallToolRequest),
      ).rejects.toThrow('Unknown test plans tool: unknown_test_plan_tool');
    });

    it('rejects impossible calendar dates and non-ISO dates in create_test_plan schema', async () => {
      await expect(
        handleTestPlansRequest(mockConnection, {
          method: 'tools/call',
          params: {
            name: 'create_test_plan',
            arguments: {
              projectId: 'P',
              name: 'Bad Date Plan',
              startDate: '2026-02-30',
            },
          },
        } as CallToolRequest),
      ).rejects.toThrow();

      await expect(
        handleTestPlansRequest(mockConnection, {
          method: 'tools/call',
          params: {
            name: 'create_test_plan',
            arguments: {
              projectId: 'P',
              name: 'Non-ISO Plan',
              endDate: 'March 1, 2026',
            },
          },
        } as CallToolRequest),
      ).rejects.toThrow();
    });
  });
});

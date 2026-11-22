import type { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsValidationError } from '../../../shared/errors';
import {
  addTestCasesToSuite,
  createTestCase,
  listSuiteTestCases,
  removeTestCasesFromSuite,
} from './feature';

describe('test-plans/test-cases feature unit', () => {
  const getTestCaseList = jest.fn();
  const addTestCasesToSuiteApi = jest.fn();
  const removeTestCasesFromSuiteApi = jest.fn();
  const createWorkItemApi = jest.fn();
  const connection = {
    serverUrl: 'https://dev.azure.com/my-org/',
    getTestPlanApi: jest.fn().mockResolvedValue({
      getTestCaseList,
      addTestCasesToSuite: addTestCasesToSuiteApi,
      removeTestCasesFromSuite: removeTestCasesFromSuiteApi,
    }),
    getWorkItemTrackingApi: jest.fn().mockResolvedValue({
      createWorkItem: createWorkItemApi,
    }),
  } as unknown as WebApi;

  beforeEach(() => {
    getTestCaseList.mockReset();
    addTestCasesToSuiteApi.mockReset();
    removeTestCasesFromSuiteApi.mockReset();
    createWorkItemApi.mockReset();
  });

  it('lists suite test cases and omits isRecursive unless explicitly true', async () => {
    getTestCaseList.mockResolvedValue([{ workItem: { id: 201 } }]);

    const result = await listSuiteTestCases(connection, {
      projectId: 'MyProject',
      planId: 5,
      suiteId: 10,
      testIds: [201, 201],
      witFields: ['System.Title', 'Microsoft.VSTS.TCM.Steps'],
      isRecursive: false,
    });

    expect(result).toEqual({ testCases: [{ workItem: { id: 201 } }] });
    expect(getTestCaseList).toHaveBeenCalledWith(
      'MyProject',
      5,
      10,
      '201',
      undefined,
      'System.Title,Microsoft.VSTS.TCM.Steps',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });

  it('adds deduplicated test cases to a suite with optional configurationIds', async () => {
    addTestCasesToSuiteApi.mockResolvedValue([
      { workItem: { id: 201 } },
      { workItem: { id: 202 } },
    ]);

    const added = await addTestCasesToSuite(connection, {
      projectId: 'MyProject',
      planId: 5,
      suiteId: 10,
      testCaseIds: [201, 202, 201],
      configurationIds: [1, 2, 1],
    });

    expect(added).toHaveLength(2);
    expect(addTestCasesToSuiteApi).toHaveBeenCalledWith(
      [
        {
          workItem: { id: 201 },
          pointAssignments: [{ configurationId: 1 }, { configurationId: 2 }],
        },
        {
          workItem: { id: 202 },
          pointAssignments: [{ configurationId: 1 }, { configurationId: 2 }],
        },
      ],
      'MyProject',
      5,
      10,
    );
  });

  it('removes deduplicated test cases from a suite', async () => {
    removeTestCasesFromSuiteApi.mockResolvedValue(undefined);

    const res = await removeTestCasesFromSuite(connection, {
      projectId: 'MyProject',
      planId: 5,
      suiteId: 10,
      testCaseIds: [301, 302, 301],
    });

    expect(res).toEqual({
      planId: 5,
      suiteId: 10,
      removedTestCaseIds: [301, 302],
    });
    expect(removeTestCasesFromSuiteApi).toHaveBeenCalledWith(
      'MyProject',
      5,
      10,
      '301,302',
    );
  });

  it('creates a Test Case with steps XML, TestedBy link, and immediate suite attachment', async () => {
    createWorkItemApi.mockResolvedValue({
      id: 777,
      fields: { 'System.Title': 'Verify login' },
    });
    addTestCasesToSuiteApi.mockResolvedValue([{ workItem: { id: 777 } }]);

    const res = await createTestCase(connection, {
      projectId: 'MyProject',
      title: 'Verify login',
      description: '<p>Checks login flow</p>',
      steps: [
        { action: 'Enter valid creds', expectedResult: 'User logged in' },
      ],
      priority: 1,
      areaPath: 'MyProject\\Auth',
      iterationPath: 'MyProject\\Sprint 1',
      assignedTo: 'qa@example.com',
      tags: ['smoke', 'auth'],
      requirementId: 500,
      planId: 5,
      suiteId: 10,
      configurationIds: [1],
    });

    expect(res.workItem.id).toBe(777);
    expect(res.suiteAssignment).toEqual([{ workItem: { id: 777 } }]);

    const patchDoc = createWorkItemApi.mock.calls[0][1];
    expect(patchDoc).toEqual(
      expect.arrayContaining([
        { op: 'add', path: '/fields/System.Title', value: 'Verify login' },
        { op: 'add', path: '/fields/System.Tags', value: 'smoke; auth' },
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'Microsoft.VSTS.Common.TestedBy-Reverse',
            url: 'https://dev.azure.com/my-org/_apis/wit/workItems/500',
          },
        },
      ]),
    );
    const stepsPatch = patchDoc.find(
      (p: { path: string }) => p.path === '/fields/Microsoft.VSTS.TCM.Steps',
    );
    expect(stepsPatch.value).toContain('<step id="2" type="ValidateStep">');
    expect(addTestCasesToSuiteApi).toHaveBeenCalledWith(
      [{ workItem: { id: 777 }, pointAssignments: [{ configurationId: 1 }] }],
      'MyProject',
      5,
      10,
    );
  });

  it('rejects createTestCase when only one of planId/suiteId is provided or configurationIds is orphaned', async () => {
    await expect(
      createTestCase(connection, {
        projectId: 'MyProject',
        title: 'Orphan plan',
        planId: 5,
      }),
    ).rejects.toThrow(AzureDevOpsValidationError);

    await expect(
      createTestCase(connection, {
        projectId: 'MyProject',
        title: 'Orphan configs',
        configurationIds: [1],
      }),
    ).rejects.toThrow(AzureDevOpsValidationError);
  });

  it('includes created workItem.id and preserves error type when suite attachment fails', async () => {
    createWorkItemApi.mockResolvedValue({
      id: 888,
      fields: { 'System.Title': 'Created Test Case' },
    });
    addTestCasesToSuiteApi.mockRejectedValue(
      Object.assign(new Error('Cannot add to dynamic suite'), {
        statusCode: 400,
      }),
    );

    const promise = createTestCase(connection, {
      projectId: 'MyProject',
      title: 'Created Test Case',
      planId: 5,
      suiteId: 10,
    });

    await expect(promise).rejects.toThrow(AzureDevOpsValidationError);
    await expect(promise).rejects.toThrow(
      /Test Case work item 888 was created/,
    );
    await expect(promise).rejects.toThrow(/add_test_cases_to_suite/);
  });

  it('recommends vso.work_write when createWorkItem fails with 403 and vso.test_write when suite attachment fails with 403', async () => {
    createWorkItemApi.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { statusCode: 403 }),
    );
    const witPromise = createTestCase(connection, {
      projectId: 'MyProject',
      title: 'No WIT Write Scope',
    });
    await expect(witPromise).rejects.toThrow(/vso\.work_write/);
    await expect(witPromise).rejects.not.toThrow(/Basic \+ Test Plans/);

    createWorkItemApi.mockResolvedValueOnce({
      id: 999,
      fields: { 'System.Title': 'Created Without Test Write' },
    });
    addTestCasesToSuiteApi.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { statusCode: 403 }),
    );
    const suitePromise = createTestCase(connection, {
      projectId: 'MyProject',
      title: 'Created Without Test Write',
      planId: 5,
      suiteId: 10,
    });
    await expect(suitePromise).rejects.toThrow(
      /Test Case work item 999 was created.*vso\.test_write.*Basic \+ Test Plans/,
    );
  });
});

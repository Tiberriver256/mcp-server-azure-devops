import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsPermissionError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import {
  addTestCasesToSuite,
  createTestCase,
  listSuiteTestCases,
  removeTestCasesFromSuite,
} from './feature.ts';

type AsyncMockFn = (...args: unknown[]) => Promise<unknown>;

interface JsonPatchEntry {
  op: string;
  path: string;
  value: unknown;
}

void describe('test-plans/test-cases feature unit', () => {
  let getTestCaseList: Mock<AsyncMockFn>;
  let addTestCasesToSuiteApi: Mock<AsyncMockFn>;
  let removeTestCasesFromSuiteApi: Mock<AsyncMockFn>;
  let createWorkItemApi: Mock<AsyncMockFn>;
  let connection: WebApi;

  beforeEach(() => {
    getTestCaseList = mock.fn<AsyncMockFn>(() => Promise.resolve(undefined));
    addTestCasesToSuiteApi = mock.fn<AsyncMockFn>(() =>
      Promise.resolve(undefined),
    );
    removeTestCasesFromSuiteApi = mock.fn<AsyncMockFn>(() =>
      Promise.resolve(undefined),
    );
    createWorkItemApi = mock.fn<AsyncMockFn>(() => Promise.resolve(undefined));
    connection = {
      serverUrl: 'https://dev.azure.com/my-org/',
      getTestPlanApi: mock.fn(() =>
        Promise.resolve({
          getTestCaseList,
          addTestCasesToSuite: addTestCasesToSuiteApi,
          removeTestCasesFromSuite: removeTestCasesFromSuiteApi,
        }),
      ),
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          createWorkItem: createWorkItemApi,
        }),
      ),
    } as unknown as WebApi;
  });

  void it('lists suite test cases and omits isRecursive unless explicitly true', async () => {
    getTestCaseList.mock.mockImplementation(() =>
      Promise.resolve([{ workItem: { id: 201 } }]),
    );

    const result = await listSuiteTestCases(connection, {
      projectId: 'MyProject',
      planId: 5,
      suiteId: 10,
      testIds: [201, 201],
      witFields: ['System.Title', 'Microsoft.VSTS.TCM.Steps'],
      isRecursive: false,
    });

    assert.deepStrictEqual(result, { testCases: [{ workItem: { id: 201 } }] });
    assert.strictEqual(getTestCaseList.mock.callCount(), 1);
    assert.deepStrictEqual(getTestCaseList.mock.calls[0]?.arguments, [
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
    ]);
  });

  void it('adds deduplicated test cases to a suite with optional configurationIds', async () => {
    addTestCasesToSuiteApi.mock.mockImplementation(() =>
      Promise.resolve([{ workItem: { id: 201 } }, { workItem: { id: 202 } }]),
    );

    const added = await addTestCasesToSuite(connection, {
      projectId: 'MyProject',
      planId: 5,
      suiteId: 10,
      testCaseIds: [201, 202, 201],
      configurationIds: [1, 2, 1],
    });

    assert.strictEqual(added.length, 2);
    assert.strictEqual(addTestCasesToSuiteApi.mock.callCount(), 1);
    assert.deepStrictEqual(addTestCasesToSuiteApi.mock.calls[0]?.arguments, [
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
    ]);
  });

  void it('removes deduplicated test cases from a suite', async () => {
    removeTestCasesFromSuiteApi.mock.mockImplementation(() =>
      Promise.resolve(undefined),
    );

    const res = await removeTestCasesFromSuite(connection, {
      projectId: 'MyProject',
      planId: 5,
      suiteId: 10,
      testCaseIds: [301, 302, 301],
    });

    assert.deepStrictEqual(res, {
      planId: 5,
      suiteId: 10,
      removedTestCaseIds: [301, 302],
    });
    assert.strictEqual(removeTestCasesFromSuiteApi.mock.callCount(), 1);
    assert.deepStrictEqual(
      removeTestCasesFromSuiteApi.mock.calls[0]?.arguments,
      ['MyProject', 5, 10, '301,302'],
    );
  });

  void it('creates a Test Case with steps XML, TestedBy link, and immediate suite attachment', async () => {
    createWorkItemApi.mock.mockImplementation(() =>
      Promise.resolve({
        id: 777,
        fields: { 'System.Title': 'Verify login' },
      }),
    );
    addTestCasesToSuiteApi.mock.mockImplementation(() =>
      Promise.resolve([{ workItem: { id: 777 } }]),
    );

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

    assert.strictEqual(res.workItem.id, 777);
    assert.deepStrictEqual(res.suiteAssignment, [{ workItem: { id: 777 } }]);

    assert.strictEqual(createWorkItemApi.mock.callCount(), 1);
    const patchDoc = createWorkItemApi.mock.calls[0]?.arguments[1] as
      | JsonPatchEntry[]
      | undefined;
    assert.ok(Array.isArray(patchDoc));
    assert.deepStrictEqual(
      patchDoc.find((p) => p.path === '/fields/System.Title'),
      { op: 'add', path: '/fields/System.Title', value: 'Verify login' },
    );
    assert.deepStrictEqual(
      patchDoc.find((p) => p.path === '/fields/System.Tags'),
      { op: 'add', path: '/fields/System.Tags', value: 'smoke; auth' },
    );
    assert.deepStrictEqual(
      patchDoc.find((p) => p.path === '/relations/-'),
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'Microsoft.VSTS.Common.TestedBy-Reverse',
          url: 'https://dev.azure.com/my-org/_apis/wit/workItems/500',
        },
      },
    );
    const stepsPatch = patchDoc.find(
      (p) => p.path === '/fields/Microsoft.VSTS.TCM.Steps',
    );
    assert.ok(stepsPatch && typeof stepsPatch.value === 'string');
    assert.ok(stepsPatch.value.includes('<step id="2" type="ValidateStep">'));

    assert.strictEqual(addTestCasesToSuiteApi.mock.callCount(), 1);
    assert.deepStrictEqual(addTestCasesToSuiteApi.mock.calls[0]?.arguments, [
      [{ workItem: { id: 777 }, pointAssignments: [{ configurationId: 1 }] }],
      'MyProject',
      5,
      10,
    ]);
  });

  void it('rejects createTestCase when only one of planId/suiteId is provided or configurationIds is orphaned', async () => {
    await assert.rejects(
      () =>
        createTestCase(connection, {
          projectId: 'MyProject',
          title: 'Orphan plan',
          planId: 5,
        }),
      AzureDevOpsValidationError,
    );

    await assert.rejects(
      () =>
        createTestCase(connection, {
          projectId: 'MyProject',
          title: 'Orphan configs',
          configurationIds: [1],
        }),
      AzureDevOpsValidationError,
    );
  });

  void it('includes created workItem.id and preserves error type when suite attachment fails', async () => {
    createWorkItemApi.mock.mockImplementation(() =>
      Promise.resolve({
        id: 888,
        fields: { 'System.Title': 'Created Test Case' },
      }),
    );
    addTestCasesToSuiteApi.mock.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('Cannot add to dynamic suite'), {
          statusCode: 400,
        }),
      ),
    );

    await assert.rejects(
      () =>
        createTestCase(connection, {
          projectId: 'MyProject',
          title: 'Created Test Case',
          planId: 5,
          suiteId: 10,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsValidationError);
        assert.match(err.message, /Test Case work item 888 was created/);
        assert.match(err.message, /add_test_cases_to_suite/);
        return true;
      },
    );
  });

  void it('recommends vso.work_write when createWorkItem fails with 403 and vso.test_write when suite attachment fails with 403', async () => {
    createWorkItemApi.mock.mockImplementationOnce(
      () =>
        Promise.reject(
          Object.assign(new Error('Forbidden'), { statusCode: 403 }),
        ),
      0,
    );
    await assert.rejects(
      () =>
        createTestCase(connection, {
          projectId: 'MyProject',
          title: 'No WIT Write Scope',
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsPermissionError);
        assert.match(err.message, /vso\.work_write/);
        assert.doesNotMatch(err.message, /Basic \+ Test Plans/);
        return true;
      },
    );

    createWorkItemApi.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          id: 999,
          fields: { 'System.Title': 'Created Without Test Write' },
        }),
      1,
    );
    addTestCasesToSuiteApi.mock.mockImplementationOnce(
      () =>
        Promise.reject(
          Object.assign(new Error('Forbidden'), { statusCode: 403 }),
        ),
      0,
    );
    await assert.rejects(
      () =>
        createTestCase(connection, {
          projectId: 'MyProject',
          title: 'Created Without Test Write',
          planId: 5,
          suiteId: 10,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsPermissionError);
        assert.match(
          err.message,
          /Test Case work item 999 was created.*vso\.test_write.*Basic \+ Test Plans/,
        );
        return true;
      },
    );
  });
});

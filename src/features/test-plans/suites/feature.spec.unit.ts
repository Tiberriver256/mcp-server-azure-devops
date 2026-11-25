import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import {
  SuiteExpand,
  TestSuiteType,
} from 'azure-devops-node-api/interfaces/TestPlanInterfaces.js';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { createTestSuite, getTestSuite, listTestSuites } from './feature.ts';

type AsyncMockFn = (...args: unknown[]) => Promise<unknown>;

void describe('test-plans/suites feature unit', () => {
  let getTestSuitesForPlan: Mock<AsyncMockFn>;
  let getTestSuiteById: Mock<AsyncMockFn>;
  let getTestPlanById: Mock<AsyncMockFn>;
  let createTestSuiteApi: Mock<AsyncMockFn>;
  let connection: WebApi;

  beforeEach(() => {
    getTestSuitesForPlan = mock.fn<AsyncMockFn>(() =>
      Promise.resolve(undefined),
    );
    getTestSuiteById = mock.fn<AsyncMockFn>(() => Promise.resolve(undefined));
    getTestPlanById = mock.fn<AsyncMockFn>(() => Promise.resolve(undefined));
    createTestSuiteApi = mock.fn<AsyncMockFn>(() => Promise.resolve(undefined));
    connection = {
      getTestPlanApi: mock.fn(() =>
        Promise.resolve({
          getTestSuitesForPlan,
          getTestSuiteById,
          getTestPlanById,
          createTestSuite: createTestSuiteApi,
        }),
      ),
    } as unknown as WebApi;
  });

  void it('lists test suites for a plan', async () => {
    getTestSuitesForPlan.mock.mockImplementation(() =>
      Promise.resolve([{ id: 10, name: 'Root' }]),
    );

    const result = await listTestSuites(connection, {
      projectId: 'MyProject',
      planId: 5,
      expand: 'children',
      asTreeView: true,
    });

    assert.deepStrictEqual(result, {
      testSuites: [{ id: 10, name: 'Root' }],
    });
    assert.strictEqual(getTestSuitesForPlan.mock.callCount(), 1);
    assert.deepStrictEqual(getTestSuitesForPlan.mock.calls[0]?.arguments, [
      'MyProject',
      5,
      SuiteExpand.Children,
      undefined,
      true,
    ]);
  });

  void it('gets a test suite by ID and throws ResourceNotFoundError when missing', async () => {
    getTestSuiteById.mock.mockImplementationOnce(
      () => Promise.resolve({ id: 11, name: 'Smoke' }),
      0,
    );
    const suite = await getTestSuite(connection, {
      projectId: 'MyProject',
      planId: 5,
      suiteId: 11,
    });
    assert.strictEqual(suite.name, 'Smoke');

    getTestSuiteById.mock.mockImplementationOnce(
      () => Promise.resolve(undefined),
      1,
    );
    await assert.rejects(
      () =>
        getTestSuite(connection, {
          projectId: 'MyProject',
          planId: 5,
          suiteId: 999,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void it('auto-resolves plan rootSuite when parentSuiteId is omitted', async () => {
    getTestPlanById.mock.mockImplementation(() =>
      Promise.resolve({ id: 5, rootSuite: { id: 100 } }),
    );
    createTestSuiteApi.mock.mockImplementation(() =>
      Promise.resolve({ id: 101, name: 'Auth Suite' }),
    );

    const created = await createTestSuite(connection, {
      projectId: 'MyProject',
      planId: 5,
      name: 'Auth Suite',
    });

    assert.deepStrictEqual(created, { id: 101, name: 'Auth Suite' });
    assert.strictEqual(getTestPlanById.mock.callCount(), 1);
    assert.deepStrictEqual(getTestPlanById.mock.calls[0]?.arguments, [
      'MyProject',
      5,
    ]);
    assert.strictEqual(createTestSuiteApi.mock.callCount(), 1);
    assert.deepStrictEqual(createTestSuiteApi.mock.calls[0]?.arguments, [
      {
        name: 'Auth Suite',
        suiteType: TestSuiteType.StaticTestSuite,
        parentSuite: { id: 100, name: '' },
      },
      'MyProject',
      5,
    ]);
  });

  void it('creates requirement-based and query-based suites and validates required fields', async () => {
    createTestSuiteApi.mock.mockImplementation(() =>
      Promise.resolve({ id: 102, name: 'Story #42' }),
    );

    await createTestSuite(connection, {
      projectId: 'MyProject',
      planId: 5,
      name: 'Story #42',
      suiteType: 'requirementTestSuite',
      parentSuiteId: 100,
      requirementId: 42,
    });

    assert.strictEqual(createTestSuiteApi.mock.callCount(), 1);
    assert.deepStrictEqual(createTestSuiteApi.mock.calls[0]?.arguments, [
      {
        name: 'Story #42',
        suiteType: TestSuiteType.RequirementTestSuite,
        parentSuite: { id: 100, name: '' },
        requirementId: 42,
      },
      'MyProject',
      5,
    ]);

    await assert.rejects(
      () =>
        createTestSuite(connection, {
          projectId: 'MyProject',
          planId: 5,
          name: 'Missing Req',
          suiteType: 'requirementTestSuite',
          parentSuiteId: 100,
        }),
      AzureDevOpsValidationError,
    );

    await assert.rejects(
      () =>
        createTestSuite(connection, {
          projectId: 'MyProject',
          planId: 5,
          name: 'Missing Query',
          suiteType: 'dynamicTestSuite',
          parentSuiteId: 100,
        }),
      AzureDevOpsValidationError,
    );
  });
});

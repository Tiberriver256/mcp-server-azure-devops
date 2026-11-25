import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { createTestPlan, getTestPlan, listTestPlans } from './feature.ts';

type AsyncMockFn = (...args: unknown[]) => Promise<unknown>;

void describe('test-plans/plans feature unit', () => {
  let getTestPlans: Mock<AsyncMockFn>;
  let getTestPlanById: Mock<AsyncMockFn>;
  let createTestPlanApi: Mock<AsyncMockFn>;
  let connection: WebApi;

  beforeEach(() => {
    getTestPlans = mock.fn<AsyncMockFn>(() => Promise.resolve(undefined));
    getTestPlanById = mock.fn<AsyncMockFn>(() => Promise.resolve(undefined));
    createTestPlanApi = mock.fn<AsyncMockFn>(() => Promise.resolve(undefined));
    connection = {
      getTestPlanApi: mock.fn(() =>
        Promise.resolve({
          getTestPlans,
          getTestPlanById,
          createTestPlan: createTestPlanApi,
        }),
      ),
    } as unknown as WebApi;
  });

  void it('lists test plans with filters', async () => {
    getTestPlans.mock.mockImplementation(() =>
      Promise.resolve([{ id: 1, name: 'Sprint 1 Plan' }]),
    );

    const result = await listTestPlans(connection, {
      projectId: 'MyProject',
      filterActivePlans: true,
      includePlanDetails: true,
    });

    assert.deepStrictEqual(result, {
      testPlans: [{ id: 1, name: 'Sprint 1 Plan' }],
    });
    assert.strictEqual(getTestPlans.mock.callCount(), 1);
    assert.deepStrictEqual(getTestPlans.mock.calls[0]?.arguments, [
      'MyProject',
      undefined,
      undefined,
      true,
      true,
    ]);
  });

  void it('gets a test plan by ID and throws ResourceNotFoundError when missing', async () => {
    getTestPlanById.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          id: 42,
          name: 'Release Plan',
          rootSuite: { id: 100 },
        }),
      0,
    );

    const plan = await getTestPlan(connection, {
      projectId: 'MyProject',
      planId: 42,
    });
    assert.strictEqual(plan.rootSuite?.id, 100);

    getTestPlanById.mock.mockImplementationOnce(
      () => Promise.resolve(undefined),
      1,
    );
    await assert.rejects(
      () => getTestPlan(connection, { projectId: 'MyProject', planId: 999 }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void it('creates a test plan with default iteration and optional fields', async () => {
    createTestPlanApi.mock.mockImplementation(() =>
      Promise.resolve({ id: 55, name: 'Sprint 27' }),
    );

    const created = await createTestPlan(connection, {
      projectId: 'MyProject',
      name: 'Sprint 27',
      description: 'QA plan',
      areaPath: 'MyProject\\QA',
      startDate: '2026-06-01',
      endDate: '2026-06-15',
      state: 'Active',
      ownerId: 'user-guid',
      buildId: 123,
    });

    assert.deepStrictEqual(created, { id: 55, name: 'Sprint 27' });
    assert.strictEqual(createTestPlanApi.mock.callCount(), 1);
    const callArgs = createTestPlanApi.mock.calls[0]?.arguments;
    assert.ok(callArgs);
    assert.strictEqual(callArgs.length, 2);
    const createParams = callArgs[0] as Record<string, unknown>;
    assert.partialDeepStrictEqual(createParams, {
      name: 'Sprint 27',
      iteration: 'MyProject',
      areaPath: 'MyProject\\QA',
      description: 'QA plan',
      state: 'Active',
      buildId: 123,
    });
    assert.deepStrictEqual(createParams.owner, { id: 'user-guid' });
    assert.strictEqual(callArgs[1], 'MyProject');
  });

  void it('rejects createTestPlan when endDate precedes startDate', async () => {
    await assert.rejects(
      () =>
        createTestPlan(connection, {
          projectId: 'MyProject',
          name: 'Bad Dates',
          startDate: '2026-06-20',
          endDate: '2026-06-01',
        }),
      AzureDevOpsValidationError,
    );
  });

  void it('rejects impossible calendar dates and non-ISO date strings in createTestPlan', async () => {
    await assert.rejects(
      () =>
        createTestPlan(connection, {
          projectId: 'MyProject',
          name: 'Invalid Calendar Date',
          startDate: '2026-02-30',
        }),
      AzureDevOpsValidationError,
    );

    await assert.rejects(
      () =>
        createTestPlan(connection, {
          projectId: 'MyProject',
          name: 'Non-ISO End Date',
          endDate: 'March 1, 2026',
        }),
      AzureDevOpsValidationError,
    );
    assert.strictEqual(createTestPlanApi.mock.callCount(), 0);
  });
});

import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import { createTestPlan, getTestPlan, listTestPlans } from './feature';

describe('test-plans/plans feature unit', () => {
  const getTestPlans = jest.fn();
  const getTestPlanById = jest.fn();
  const createTestPlanApi = jest.fn();
  const connection = {
    getTestPlanApi: jest.fn().mockResolvedValue({
      getTestPlans,
      getTestPlanById,
      createTestPlan: createTestPlanApi,
    }),
  } as unknown as WebApi;

  beforeEach(() => {
    getTestPlans.mockReset();
    getTestPlanById.mockReset();
    createTestPlanApi.mockReset();
  });

  it('lists test plans with filters', async () => {
    getTestPlans.mockResolvedValue([{ id: 1, name: 'Sprint 1 Plan' }]);

    const result = await listTestPlans(connection, {
      projectId: 'MyProject',
      filterActivePlans: true,
      includePlanDetails: true,
    });

    expect(result).toEqual({ testPlans: [{ id: 1, name: 'Sprint 1 Plan' }] });
    expect(getTestPlans).toHaveBeenCalledWith(
      'MyProject',
      undefined,
      undefined,
      true,
      true,
    );
  });

  it('gets a test plan by ID and throws ResourceNotFoundError when missing', async () => {
    getTestPlanById.mockResolvedValueOnce({
      id: 42,
      name: 'Release Plan',
      rootSuite: { id: 100 },
    });

    const plan = await getTestPlan(connection, {
      projectId: 'MyProject',
      planId: 42,
    });
    expect(plan.rootSuite?.id).toBe(100);

    getTestPlanById.mockResolvedValueOnce(undefined);
    await expect(
      getTestPlan(connection, { projectId: 'MyProject', planId: 999 }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  it('creates a test plan with default iteration and optional fields', async () => {
    createTestPlanApi.mockResolvedValue({ id: 55, name: 'Sprint 27' });

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

    expect(created).toEqual({ id: 55, name: 'Sprint 27' });
    expect(createTestPlanApi).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Sprint 27',
        iteration: 'MyProject',
        areaPath: 'MyProject\\QA',
        description: 'QA plan',
        state: 'Active',
        owner: { id: 'user-guid' },
        buildId: 123,
      }),
      'MyProject',
    );
  });

  it('rejects createTestPlan when endDate precedes startDate', async () => {
    await expect(
      createTestPlan(connection, {
        projectId: 'MyProject',
        name: 'Bad Dates',
        startDate: '2026-06-20',
        endDate: '2026-06-01',
      }),
    ).rejects.toThrow(AzureDevOpsValidationError);
  });

  it('rejects impossible calendar dates and non-ISO date strings in createTestPlan', async () => {
    await expect(
      createTestPlan(connection, {
        projectId: 'MyProject',
        name: 'Invalid Calendar Date',
        startDate: '2026-02-30',
      }),
    ).rejects.toThrow(AzureDevOpsValidationError);

    await expect(
      createTestPlan(connection, {
        projectId: 'MyProject',
        name: 'Non-ISO End Date',
        endDate: 'March 1, 2026',
      }),
    ).rejects.toThrow(AzureDevOpsValidationError);
    expect(createTestPlanApi).not.toHaveBeenCalled();
  });
});

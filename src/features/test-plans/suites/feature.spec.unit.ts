import { WebApi } from 'azure-devops-node-api';
import {
  SuiteExpand,
  TestSuiteType,
} from 'azure-devops-node-api/interfaces/TestPlanInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import { createTestSuite, getTestSuite, listTestSuites } from './feature';

describe('test-plans/suites feature unit', () => {
  const getTestSuitesForPlan = jest.fn();
  const getTestSuiteById = jest.fn();
  const getTestPlanById = jest.fn();
  const createTestSuiteApi = jest.fn();
  const connection = {
    getTestPlanApi: jest.fn().mockResolvedValue({
      getTestSuitesForPlan,
      getTestSuiteById,
      getTestPlanById,
      createTestSuite: createTestSuiteApi,
    }),
  } as unknown as WebApi;

  beforeEach(() => {
    getTestSuitesForPlan.mockReset();
    getTestSuiteById.mockReset();
    getTestPlanById.mockReset();
    createTestSuiteApi.mockReset();
  });

  it('lists test suites for a plan', async () => {
    getTestSuitesForPlan.mockResolvedValue([{ id: 10, name: 'Root' }]);

    const result = await listTestSuites(connection, {
      projectId: 'MyProject',
      planId: 5,
      expand: 'children',
      asTreeView: true,
    });

    expect(result).toEqual({ testSuites: [{ id: 10, name: 'Root' }] });
    expect(getTestSuitesForPlan).toHaveBeenCalledWith(
      'MyProject',
      5,
      SuiteExpand.Children,
      undefined,
      true,
    );
  });

  it('gets a test suite by ID and throws ResourceNotFoundError when missing', async () => {
    getTestSuiteById.mockResolvedValueOnce({ id: 11, name: 'Smoke' });
    const suite = await getTestSuite(connection, {
      projectId: 'MyProject',
      planId: 5,
      suiteId: 11,
    });
    expect(suite.name).toBe('Smoke');

    getTestSuiteById.mockResolvedValueOnce(undefined);
    await expect(
      getTestSuite(connection, {
        projectId: 'MyProject',
        planId: 5,
        suiteId: 999,
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  it('auto-resolves plan rootSuite when parentSuiteId is omitted', async () => {
    getTestPlanById.mockResolvedValue({ id: 5, rootSuite: { id: 100 } });
    createTestSuiteApi.mockResolvedValue({ id: 101, name: 'Auth Suite' });

    const created = await createTestSuite(connection, {
      projectId: 'MyProject',
      planId: 5,
      name: 'Auth Suite',
    });

    expect(created).toEqual({ id: 101, name: 'Auth Suite' });
    expect(getTestPlanById).toHaveBeenCalledWith('MyProject', 5);
    expect(createTestSuiteApi).toHaveBeenCalledWith(
      {
        name: 'Auth Suite',
        suiteType: TestSuiteType.StaticTestSuite,
        parentSuite: { id: 100, name: '' },
      },
      'MyProject',
      5,
    );
  });

  it('creates requirement-based and query-based suites and validates required fields', async () => {
    createTestSuiteApi.mockResolvedValue({ id: 102, name: 'Story #42' });

    await createTestSuite(connection, {
      projectId: 'MyProject',
      planId: 5,
      name: 'Story #42',
      suiteType: 'requirementTestSuite',
      parentSuiteId: 100,
      requirementId: 42,
    });

    expect(createTestSuiteApi).toHaveBeenCalledWith(
      {
        name: 'Story #42',
        suiteType: TestSuiteType.RequirementTestSuite,
        parentSuite: { id: 100, name: '' },
        requirementId: 42,
      },
      'MyProject',
      5,
    );

    await expect(
      createTestSuite(connection, {
        projectId: 'MyProject',
        planId: 5,
        name: 'Missing Req',
        suiteType: 'requirementTestSuite',
        parentSuiteId: 100,
      }),
    ).rejects.toThrow(AzureDevOpsValidationError);

    await expect(
      createTestSuite(connection, {
        projectId: 'MyProject',
        planId: 5,
        name: 'Missing Query',
        suiteType: 'dynamicTestSuite',
        parentSuiteId: 100,
      }),
    ).rejects.toThrow(AzureDevOpsValidationError);
  });
});

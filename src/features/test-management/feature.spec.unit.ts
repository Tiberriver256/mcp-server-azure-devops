import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
} from '../../shared/errors';
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

describe('test management REST feature', () => {
  const rest = {
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const testApi = {
    createRequestOptions: jest.fn().mockReturnValue({}),
    rest,
  };
  const connection = {
    serverUrl: 'https://dev.azure.com/example-org',
    getTestApi: jest.fn().mockResolvedValue(testApi),
  } as unknown as WebApi;

  beforeEach(() => {
    jest.clearAllMocks();
    rest.get.mockResolvedValue({ result: { count: 0, value: [] } });
    rest.create.mockResolvedValue({ result: { id: 41 } });
    rest.update.mockResolvedValue({ result: { id: 41 } });
  });

  it('uses the Test Plan API to list plans', async () => {
    await expect(
      listTestPlans(connection, {
        projectId: 'Example Project',
        includePlanDetails: false,
        filterActivePlans: true,
      }),
    ).resolves.toEqual({ count: 0, value: [] });

    expect(rest.get).toHaveBeenCalledWith(
      'https://dev.azure.com/example-org/Example%20Project/_apis/testplan/plans?api-version=5.0-preview.1&includePlanDetails=false&filterActivePlans=true',
      {},
    );
  });

  it('uses Test Plan routes for suites, cases, and points', async () => {
    await listTestSuites(connection, {
      projectId: 'Example',
      planId: 10,
      includeChildren: true,
    });
    await listSuiteTestCases(connection, {
      projectId: 'Example',
      planId: 10,
      suiteId: 20,
    });
    await listTestPoints(connection, {
      projectId: 'Example',
      planId: 10,
      suiteId: 20,
      testCaseId: 30,
    });

    expect(rest.get).toHaveBeenNthCalledWith(
      1,
      'https://dev.azure.com/example-org/Example/_apis/testplan/plans/10/suites?api-version=5.0-preview.1&asTreeView=true',
      {},
    );
    expect(rest.get).toHaveBeenNthCalledWith(
      2,
      'https://dev.azure.com/example-org/Example/_apis/testplan/plans/10/suites/20/testcase?api-version=5.0-preview.2',
      {},
    );
    expect(rest.get).toHaveBeenNthCalledWith(
      3,
      'https://dev.azure.com/example-org/Example/_apis/testplan/plans/10/suites/20/testpoint?api-version=5.0-preview.2&testCaseId=30',
      {},
    );
  });

  it('creates a manual run with the selected plan and points', async () => {
    await expect(
      createTestRun(connection, {
        projectId: 'Example',
        name: 'Release 8.4 regression',
        planId: 10,
        pointIds: [101, 102],
        comment: 'Selected from the release scope',
      }),
    ).resolves.toEqual({ id: 41 });

    expect(rest.create).toHaveBeenCalledWith(
      'https://dev.azure.com/example-org/Example/_apis/test/runs?api-version=5.0',
      {
        name: 'Release 8.4 regression',
        plan: { id: '10' },
        pointIds: [101, 102],
        automated: false,
        comment: 'Selected from the release scope',
      },
      {},
    );
  });

  it('lists, records, and completes test runs through the Test API', async () => {
    await listTestResults(connection, {
      projectId: 'Example',
      runId: 41,
      skip: 0,
      top: 200,
    });
    await updateTestResults(connection, {
      projectId: 'Example',
      runId: 41,
      results: [{ id: 501, outcome: 'Passed', comment: 'Verified in browser' }],
    });
    await completeTestRun(connection, {
      projectId: 'Example',
      runId: 41,
      comment: 'All selected checks complete',
    });

    expect(rest.get).toHaveBeenCalledWith(
      'https://dev.azure.com/example-org/Example/_apis/test/runs/41/results?api-version=5.0&%24skip=0&%24top=200',
      {},
    );
    expect(rest.update).toHaveBeenNthCalledWith(
      1,
      'https://dev.azure.com/example-org/Example/_apis/test/runs/41/results?api-version=5.0',
      [
        {
          id: 501,
          outcome: 'Passed',
          comment: 'Verified in browser',
          state: 'Completed',
        },
      ],
      {},
    );
    expect(rest.update).toHaveBeenNthCalledWith(
      2,
      'https://dev.azure.com/example-org/Example/_apis/test/runs/41?api-version=5.0',
      {
        state: 'Completed',
        comment: 'All selected checks complete',
        completedDate: undefined,
      },
      {},
    );
  });

  it('maps Test Plans HTTP errors to the shared error types', async () => {
    rest.get.mockRejectedValueOnce({ statusCode: 404, message: 'Missing' });
    await expect(
      listTestPlans(connection, {
        projectId: 'Example',
        includePlanDetails: false,
        filterActivePlans: true,
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsResourceNotFoundError);

    rest.get.mockRejectedValueOnce({ statusCode: 403, message: 'Forbidden' });
    await expect(
      listTestPlans(connection, {
        projectId: 'Example',
        includePlanDetails: false,
        filterActivePlans: true,
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsPermissionError);
  });
});

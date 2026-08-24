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
    serverUrl: 'https://ado.example.local/tfs/DefaultCollection',
    getTestApi: jest.fn().mockResolvedValue(testApi),
  } as unknown as WebApi;

  beforeEach(() => {
    jest.clearAllMocks();
    rest.get.mockResolvedValue({
      result: { count: 0, value: [] },
      headers: {},
    });
    rest.create.mockResolvedValue({ result: { id: 41 } });
    rest.update.mockResolvedValue({ result: { id: 41 } });
  });

  it('uses stable 7.0 on-prem routes and returns continuation headers', async () => {
    rest.get.mockResolvedValueOnce({
      result: { count: 1, value: [{ id: 10 }] },
      headers: { 'X-MS-ContinuationToken': 'next-page' },
    });

    await expect(
      listTestPlans(connection, {
        projectId: 'Example Project',
        includePlanDetails: false,
        filterActivePlans: true,
        continuationToken: 'current-page',
      }),
    ).resolves.toEqual({
      count: 1,
      value: [{ id: 10 }],
      continuationToken: 'next-page',
    });

    expect(rest.get).toHaveBeenCalledWith(
      'https://ado.example.local/tfs/DefaultCollection/Example%20Project/_apis/testplan/plans?api-version=7.0&includePlanDetails=false&filterActivePlans=true&continuationToken=current-page',
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
      skip: 200,
      top: 200,
    });

    expect(rest.get).toHaveBeenNthCalledWith(
      1,
      'https://ado.example.local/tfs/DefaultCollection/Example/_apis/testplan/plans/10/suites?api-version=7.0&asTreeView=true',
      {},
    );
    expect(rest.get).toHaveBeenNthCalledWith(
      2,
      'https://ado.example.local/tfs/DefaultCollection/Example/_apis/testplan/plans/10/suites/20/testcase?api-version=7.0',
      {},
    );
    expect(rest.get).toHaveBeenNthCalledWith(
      3,
      'https://ado.example.local/tfs/DefaultCollection/Example/_apis/test/plans/10/suites/20/points?api-version=7.0&testCaseId=30&%24skip=200&%24top=200',
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
      'https://ado.example.local/tfs/DefaultCollection/Example/_apis/test/runs?api-version=7.0',
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
      'https://ado.example.local/tfs/DefaultCollection/Example/_apis/test/runs/41/results?api-version=7.0&%24skip=0&%24top=200',
      {},
    );
    expect(rest.update).toHaveBeenNthCalledWith(
      1,
      'https://ado.example.local/tfs/DefaultCollection/Example/_apis/test/runs/41/results?api-version=7.0',
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
      'https://ado.example.local/tfs/DefaultCollection/Example/_apis/test/runs/41?api-version=7.0',
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

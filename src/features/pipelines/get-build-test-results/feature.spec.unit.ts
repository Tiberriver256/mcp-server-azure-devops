import assert from 'node:assert/strict';
import { beforeEach, describe, mock, test } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import type {
  TestCaseResult,
  TestRun,
} from 'azure-devops-node-api/interfaces/TestInterfaces.js';
import {
  ResultDetails,
  TestOutcome,
} from 'azure-devops-node-api/interfaces/TestInterfaces.js';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import {
  computePerRunTopLimit,
  getBuildTestResults,
  resolveResultDetails,
  resolveTestOutcomes,
} from './feature.ts';
import { GetBuildTestResultsSchema } from './schema.ts';

type GetTestRunsFn = (
  project: string,
  buildUri?: string,
  owner?: string,
  tmiRunId?: string,
  planId?: number,
  includeRunDetails?: boolean,
  automated?: boolean,
  skip?: number,
  top?: number,
) => Promise<TestRun[] | null>;

type GetTestResultsFn = (
  project: string,
  runId: number,
  detailsToInclude?: ResultDetails,
  skip?: number,
  top?: number,
  outcomes?: TestOutcome[],
) => Promise<TestCaseResult[] | null>;

void describe('getBuildTestResults unit', () => {
  let mockConnection: WebApi;
  let mockGetTestApi: Mock<() => Promise<unknown>>;
  let mockGetTestRuns: Mock<GetTestRunsFn>;
  let mockGetTestResults: Mock<GetTestResultsFn>;

  beforeEach(() => {
    mockGetTestRuns = mock.fn<GetTestRunsFn>(() =>
      Promise.reject(new Error('Unexpected getTestRuns call')),
    );
    mockGetTestResults = mock.fn<GetTestResultsFn>(() =>
      Promise.reject(new Error('Unexpected getTestResults call')),
    );

    const mockTestApi = {
      getTestRuns: mockGetTestRuns,
      getTestResults: mockGetTestResults,
    };

    mockGetTestApi = mock.fn(() => Promise.resolve(mockTestApi));
    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
      getTestApi: mockGetTestApi,
    } as unknown as WebApi;
  });

  void test('fetches failure-focused results by default with run summary and extracted fields', async () => {
    const run: TestRun = {
      id: 700,
      name: 'Unit Tests',
      state: 'Completed',
      isAutomated: true,
      totalTests: 3,
      passedTests: 1,
      unanalyzedTests: 2,
      incompleteTests: 0,
      notApplicableTests: 0,
      startedDate: new Date('2026-11-25T05:02:00.000Z'),
      completedDate: new Date('2026-11-25T05:05:00.000Z'),
      url: 'https://dev.azure.com/testorg/DemoProject/_apis/test/Runs/700',
    };
    const results: TestCaseResult[] = [
      {
        id: 100000,
        testCaseTitle: 'should handle expired token',
        automatedTestName: 'Auth.TokenSpec.shouldHandleExpiredToken',
        automatedTestStorage: 'auth.spec.ts',
        outcome: 'Failed',
        errorMessage: 'Expected 401 but received 500',
        stackTrace: 'at AuthSpec (src/auth.spec.ts:42:11)',
        durationInMs: 125,
        failingSince: {
          date: new Date('2026-11-24T01:00:00.000Z'),
          build: { id: 499, number: '20261124.9' },
        },
        associatedBugs: [
          {
            id: '42',
            name: 'Bug 42',
            url: 'https://dev.azure.com/testorg/_apis/wit/workItems/42',
          },
        ],
      },
      {
        id: 100002,
        testCaseTitle: 'should timeout gracefully',
        automatedTestName: 'Net.TimeoutSpec.shouldTimeout',
        automatedTestStorage: 'net.spec.ts',
        outcome: 'Aborted',
        errorMessage: 'Test host aborted after 5000ms',
        stackTrace: undefined,
        durationInMs: 5000,
      },
    ];

    mockGetTestRuns.mock.mockImplementation(() => Promise.resolve([run]));
    mockGetTestResults.mock.mockImplementation(() => Promise.resolve(results));

    const response = await getBuildTestResults(mockConnection, {
      projectId: 'DemoProject',
      runId: 500,
    });

    assert.strictEqual(mockGetTestRuns.mock.callCount(), 1);
    const runsArgs = mockGetTestRuns.mock.calls[0]?.arguments;
    assert.ok(runsArgs);
    assert.strictEqual(runsArgs[0], 'DemoProject');
    assert.strictEqual(runsArgs[1], 'vstfs:///Build/Build/500');
    assert.strictEqual(runsArgs[5], true);

    assert.strictEqual(mockGetTestResults.mock.callCount(), 1);
    const resultsArgs = mockGetTestResults.mock.calls[0]?.arguments;
    assert.ok(resultsArgs);
    assert.strictEqual(resultsArgs[0], 'DemoProject');
    assert.strictEqual(resultsArgs[1], 700);
    assert.strictEqual(resultsArgs[2], undefined);
    assert.strictEqual(resultsArgs[3], undefined);
    assert.strictEqual(resultsArgs[4], 101);
    assert.deepStrictEqual(resultsArgs[5], [
      TestOutcome.Failed,
      TestOutcome.Aborted,
      TestOutcome.Timeout,
      TestOutcome.Error,
    ]);

    assert.strictEqual(response.buildId, 500);
    assert.strictEqual(response.projectId, 'DemoProject');
    assert.deepStrictEqual(response.summary, {
      totalRuns: 1,
      totalTests: 3,
      passedTests: 1,
      failedTests: 2,
      incompleteTests: 0,
      notApplicableTests: 0,
    });
    assert.strictEqual(response.runs.length, 1);
    assert.strictEqual(response.runs[0]?.id, 700);
    assert.strictEqual(response.runs[0]?.failedTests, 2);
    assert.strictEqual(response.results.length, 2);
    assert.strictEqual(
      response.results[0]?.automatedTestName,
      'Auth.TokenSpec.shouldHandleExpiredToken',
    );
    assert.strictEqual(
      response.results[0]?.errorMessage,
      'Expected 401 but received 500',
    );
    assert.strictEqual(
      response.results[0]?.stackTrace,
      'at AuthSpec (src/auth.spec.ts:42:11)',
    );
    assert.deepStrictEqual(response.results[0]?.failingSince, {
      date: '2026-11-24T01:00:00.000Z',
      build: { id: 499, number: '20261124.9' },
    });
    assert.deepStrictEqual(response.results[0]?.associatedBugs, [
      {
        id: '42',
        name: 'Bug 42',
        url: 'https://dev.azure.com/testorg/_apis/wit/workItems/42',
      },
    ]);
    assert.strictEqual(response.truncated, false);
  });

  void test('returns clean empty summary when build has zero test runs', async () => {
    mockGetTestRuns.mock.mockImplementation(() => Promise.resolve([]));

    const response = await getBuildTestResults(mockConnection, {
      projectId: 'DemoProject',
      runId: 501,
    });

    assert.strictEqual(mockGetTestResults.mock.callCount(), 0);
    assert.deepStrictEqual(response, {
      buildId: 501,
      projectId: 'DemoProject',
      summary: {
        totalRuns: 0,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        incompleteTests: 0,
        notApplicableTests: 0,
      },
      runs: [],
      results: [],
      truncated: false,
    });
  });

  void test('supports explicit outcomes array and outcomes="all"', async () => {
    const run: TestRun = {
      id: 701,
      name: 'Smoke',
      isAutomated: true,
      totalTests: 2,
      passedTests: 2,
      url: 'https://dev.azure.com/testorg/DemoProject/_apis/test/Runs/701',
    };
    mockGetTestRuns.mock.mockImplementation(() => Promise.resolve([run]));
    mockGetTestResults.mock.mockImplementation(() => Promise.resolve([]));

    await getBuildTestResults(mockConnection, {
      projectId: 'DemoProject',
      runId: 500,
      outcomes: ['Passed', 3],
    });

    assert.deepStrictEqual(mockGetTestResults.mock.calls[0]?.arguments[5], [
      TestOutcome.Passed,
      TestOutcome.Failed,
    ]);

    await getBuildTestResults(mockConnection, {
      projectId: 'DemoProject',
      runId: 500,
      outcomes: 'all',
    });

    assert.strictEqual(
      mockGetTestResults.mock.calls[1]?.arguments[5],
      undefined,
    );
  });

  void test('clamps per-run $top to <= 200 when detailsToInclude is non-None and <= 1000 otherwise', async () => {
    const run: TestRun = {
      id: 702,
      name: 'Integration',
      isAutomated: true,
      totalTests: 300,
      passedTests: 50,
      unanalyzedTests: 250,
      url: 'https://dev.azure.com/testorg/DemoProject/_apis/test/Runs/702',
    };
    mockGetTestRuns.mock.mockImplementation(() => Promise.resolve([run]));
    mockGetTestResults.mock.mockImplementation(() => Promise.resolve([]));

    await getBuildTestResults(mockConnection, {
      projectId: 'DemoProject',
      runId: 500,
      detailsToInclude: 'SubResults',
      maxResults: 250,
    });

    const argsWithDetails = mockGetTestResults.mock.calls[0]?.arguments;
    assert.strictEqual(argsWithDetails?.[2], ResultDetails.SubResults);
    assert.strictEqual(argsWithDetails?.[4], 200);

    await getBuildTestResults(mockConnection, {
      projectId: 'DemoProject',
      runId: 500,
      detailsToInclude: 'None',
      maxResults: 1000,
    });

    const argsWithoutDetails = mockGetTestResults.mock.calls[1]?.arguments;
    assert.strictEqual(argsWithoutDetails?.[2], undefined);
    assert.strictEqual(argsWithoutDetails?.[4], 1000);
  });

  void test('caps total returned results across multiple runs with bounded concurrency and sets truncated=true', async () => {
    const runs: TestRun[] = Array.from({ length: 6 }, (_, i) => ({
      id: 800 + i,
      name: `Run ${i + 1}`,
      isAutomated: true,
      totalTests: 5,
      passedTests: 3,
      runStatistics: [
        { state: 'Completed', outcome: 'Passed', count: 3 },
        { state: 'Completed', outcome: 'Failed', count: 2 },
      ],
      url: `https://dev.azure.com/testorg/DemoProject/_apis/test/Runs/${800 + i}`,
    }));

    mockGetTestRuns.mock.mockImplementation(() => Promise.resolve(runs));

    let inFlight = 0;
    let maxInFlight = 0;
    mockGetTestResults.mock.mockImplementation(async (_project, runId) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
      inFlight -= 1;
      return [
        {
          id: runId * 10 + 1,
          testCaseTitle: `Fail A (${runId})`,
          outcome: 'Failed',
        },
        {
          id: runId * 10 + 2,
          testCaseTitle: `Fail B (${runId})`,
          outcome: 'Failed',
        },
      ];
    });

    const response = await getBuildTestResults(mockConnection, {
      projectId: 'DemoProject',
      runId: 500,
      maxResults: 5,
    });

    assert.ok(
      maxInFlight <= 5,
      `Expected concurrency <= 5, got ${maxInFlight}`,
    );
    assert.strictEqual(response.summary.totalRuns, 6);
    assert.strictEqual(response.summary.totalTests, 30);
    assert.strictEqual(response.summary.passedTests, 18);
    assert.strictEqual(response.summary.failedTests, 12);
    assert.strictEqual(response.results.length, 5);
    assert.strictEqual(response.truncated, true);
    // Preserves run order
    assert.strictEqual(response.results[0]?.runId, 800);
    assert.strictEqual(response.results[2]?.runId, 801);
  });

  void test('throws AzureDevOpsResourceNotFoundError when getTestRuns returns null (404)', async () => {
    mockGetTestRuns.mock.mockImplementation(() => Promise.resolve(null));

    await assert.rejects(
      () =>
        getBuildTestResults(mockConnection, {
          projectId: 'DemoProject',
          runId: 999999,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsResourceNotFoundError);
        assert.match(err.message, /999999/);
        return true;
      },
    );
  });

  void test('maps HTTP errors (401, 403, 404, 400, 500) to typed AzureDevOps errors', async () => {
    const cases = [
      {
        statusCode: 401,
        msg: 'Unauthorized',
        cls: AzureDevOpsAuthenticationError,
      },
      { statusCode: 403, msg: 'Forbidden', cls: AzureDevOpsPermissionError },
      {
        statusCode: 404,
        msg: 'Build 999 not found',
        cls: AzureDevOpsResourceNotFoundError,
      },
      { statusCode: 400, msg: 'Bad request', cls: AzureDevOpsValidationError },
      { statusCode: 500, msg: 'Server exploded', cls: AzureDevOpsError },
    ] as const;

    for (const c of cases) {
      const err = Object.assign(new Error(c.msg), { statusCode: c.statusCode });
      mockGetTestRuns.mock.mockImplementation(() => Promise.reject(err));

      await assert.rejects(
        () =>
          getBuildTestResults(mockConnection, {
            projectId: 'DemoProject',
            runId: 500,
          }),
        c.cls,
      );
    }
  });

  void test('validates outcomes, detailsToInclude, and maxResults boundaries via schema and helpers', () => {
    assert.throws(
      () => resolveTestOutcomes(['BogusOutcome']),
      AzureDevOpsValidationError,
    );
    assert.throws(() => resolveTestOutcomes([99]), AzureDevOpsValidationError);
    assert.throws(
      () => resolveResultDetails('UnknownDetail'),
      AzureDevOpsValidationError,
    );
    assert.strictEqual(
      computePerRunTopLimit(250, ResultDetails.SubResults),
      200,
    );
    assert.strictEqual(computePerRunTopLimit(1500, ResultDetails.None), 1000);

    assert.strictEqual(
      GetBuildTestResultsSchema.safeParse({
        runId: 500,
        outcomes: ['BogusOutcome'],
      }).success,
      false,
    );
    assert.strictEqual(
      GetBuildTestResultsSchema.safeParse({
        runId: 500,
        maxResults: 1001,
      }).success,
      false,
    );
    assert.strictEqual(
      GetBuildTestResultsSchema.safeParse({
        pipelineName: 'CI-Main',
        buildNumber: '20261125.1',
        outcomes: ['Passed'],
        detailsToInclude: 'WorkItems',
        maxResults: 50,
      }).success,
      true,
    );
  });
});

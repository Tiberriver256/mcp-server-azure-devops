import { WebApi } from 'azure-devops-node-api';
import * as TestInterfaces from 'azure-devops-node-api/interfaces/TestInterfaces';

/**
 * Get test results for a build
 */
export async function getTestResults(
  connection: WebApi,
  options: {
    projectId?: string;
    buildId: number;
    publishContext?: string;
    top?: number;
    skip?: number;
    outcomes?: string[];
  },
): Promise<{
  results: Array<{
    id: number;
    testCaseTitle?: string;
    automatedTestName?: string;
    outcome?: string;
    state?: string;
    priority?: number;
    computerName?: string;
    completedDate?: Date;
    startedDate?: Date;
    duration?: number;
    errorMessage?: string;
    stackTrace?: string;
  }>;
  count: number;
}> {
  const testApi = await connection.getTestApi();
  const projectId = options.projectId ?? 'CCTV';

  // First get test runs for the build
  const runs = await testApi.getTestRuns(
    projectId,
    `vstfs:///Build/Build/${options.buildId}`,
  );

  if (!runs || runs.length === 0) {
    return { results: [], count: 0 };
  }

  // Get results from the first test run
  const runId = runs[0].id;
  if (!runId) {
    return { results: [], count: 0 };
  }

  const results = await testApi.getTestResults(
    projectId,
    runId,
    undefined, // detailsToInclude
    options.skip,
    options.top || 100,
    options.outcomes?.map((o) => {
      switch (o.toLowerCase()) {
        case 'passed':
          return TestInterfaces.TestOutcome.Passed;
        case 'failed':
          return TestInterfaces.TestOutcome.Failed;
        case 'inconclusive':
          return TestInterfaces.TestOutcome.Inconclusive;
        case 'timeout':
          return TestInterfaces.TestOutcome.Timeout;
        case 'aborted':
          return TestInterfaces.TestOutcome.Aborted;
        case 'blocked':
          return TestInterfaces.TestOutcome.Blocked;
        case 'notexecuted':
          return TestInterfaces.TestOutcome.NotExecuted;
        case 'warning':
          return TestInterfaces.TestOutcome.Warning;
        case 'error':
          return TestInterfaces.TestOutcome.Error;
        case 'notapplicable':
          return TestInterfaces.TestOutcome.NotApplicable;
        case 'paused':
          return TestInterfaces.TestOutcome.Paused;
        case 'inprogress':
          return TestInterfaces.TestOutcome.InProgress;
        case 'notimpacted':
          return TestInterfaces.TestOutcome.NotImpacted;
        default:
          return TestInterfaces.TestOutcome.None;
      }
    }),
  );

  return {
    results: results.map((result) => ({
      id: result.id || 0,
      testCaseTitle: result.testCaseTitle,
      automatedTestName: result.automatedTestName,
      outcome: result.outcome,
      state: result.state,
      priority: result.priority,
      computerName: result.computerName,
      completedDate: result.completedDate,
      startedDate: result.startedDate,
      duration: result.durationInMs,
      errorMessage: result.errorMessage,
      stackTrace: result.stackTrace,
    })),
    count: results.length,
  };
}

/**
 * Get test run statistics for a build
 */
export async function getTestRunStats(
  connection: WebApi,
  options: {
    projectId?: string;
    buildId: number;
  },
): Promise<{
  runs: Array<{
    id?: number;
    name?: string;
    state?: string;
    totalTests?: number;
    passedTests?: number;
    failedTests?: number;
    incompleteTests?: number;
    notApplicableTests?: number;
    completedDate?: Date;
    startedDate?: Date;
    runStatistics?: Array<{
      state?: string;
      outcome?: string;
      count?: number;
      resolutionState?: string;
    }>;
    webAccessUrl?: string;
  }>;
  summary: {
    totalRuns: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    passRate?: number;
  };
}> {
  const testApi = await connection.getTestApi();
  const projectId = options.projectId ?? 'CCTV';

  // Get test runs for the build
  const runs = await testApi.getTestRuns(
    projectId,
    `vstfs:///Build/Build/${options.buildId}`,
  );

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  const runDetails = runs.map((run) => {
    const passed = run.passedTests || 0;
    const failed = run.unanalyzedTests || 0;
    const total = run.totalTests || 0;

    totalTests += total;
    passedTests += passed;
    failedTests += failed;

    return {
      id: run.id,
      name: run.name,
      state: run.state,
      totalTests: total,
      passedTests: passed,
      failedTests: failed,
      incompleteTests: run.incompleteTests,
      notApplicableTests: run.notApplicableTests,
      completedDate: run.completedDate,
      startedDate: run.startedDate,
      runStatistics: run.runStatistics?.map((stat) => ({
        state: stat.state,
        outcome: stat.outcome,
        count: stat.count,
        resolutionState: stat.resolutionState?.toString(),
      })),
      webAccessUrl: run.webAccessUrl,
    };
  });

  return {
    runs: runDetails,
    summary: {
      totalRuns: runs.length,
      totalTests,
      passedTests,
      failedTests,
      passRate: totalTests > 0 ? (passedTests / totalTests) * 100 : undefined,
    },
  };
}

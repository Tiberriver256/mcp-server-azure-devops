import type { WebApi } from 'azure-devops-node-api';
import type {
  FailingSince,
  ShallowReference,
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
import { mapWithConcurrency } from '../../../shared/utils/concurrency.ts';
import { resolvePipelineProjectId } from '../helpers.ts';
import type {
  BuildTestResultBugReference,
  BuildTestResultFailingSince,
  BuildTestResultItem,
  BuildTestResultsResponse,
  BuildTestRunSummary,
  GetBuildTestResultsOptions,
  ResultDetailsName,
  TestOutcomeName,
} from '../types.ts';

export const DEFAULT_MAX_RESULTS = 100;
export const MAX_TOTAL_RESULTS = 1000;
export const MAX_TOP_WITHOUT_DETAILS = 1000;
export const MAX_TOP_WITH_DETAILS = 200;
export const DEFAULT_TOP_RUNS = 50;
export const MAX_TOP_RUNS = 200;
const TEST_RESULTS_CONCURRENCY = 5;

export const DEFAULT_FAILURE_OUTCOMES: readonly TestOutcomeName[] = [
  'Failed',
  'Aborted',
  'Timeout',
  'Error',
];

const TEST_OUTCOME_BY_LOWER_NAME: Readonly<Record<string, TestOutcome>> = {
  unspecified: TestOutcome.Unspecified,
  none: TestOutcome.None,
  passed: TestOutcome.Passed,
  failed: TestOutcome.Failed,
  inconclusive: TestOutcome.Inconclusive,
  timeout: TestOutcome.Timeout,
  aborted: TestOutcome.Aborted,
  blocked: TestOutcome.Blocked,
  notexecuted: TestOutcome.NotExecuted,
  warning: TestOutcome.Warning,
  error: TestOutcome.Error,
  notapplicable: TestOutcome.NotApplicable,
  paused: TestOutcome.Paused,
  inprogress: TestOutcome.InProgress,
  notimpacted: TestOutcome.NotImpacted,
};

const RESULT_DETAILS_BY_LOWER_NAME: Readonly<Record<string, ResultDetails>> = {
  none: ResultDetails.None,
  iterations: ResultDetails.Iterations,
  workitems: ResultDetails.WorkItems,
  subresults: ResultDetails.SubResults,
  point: ResultDetails.Point,
};

const FAILURE_STAT_OUTCOMES = new Set([
  'failed',
  'aborted',
  'timeout',
  'error',
]);

function getErrorStatusCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const code = (error as { statusCode?: unknown }).statusCode;
    if (typeof code === 'number') {
      return code;
    }
  }
  return undefined;
}

function formatDateValue(value: Date | string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
}

/**
 * Resolve user-supplied `outcomes` option into SDK `TestOutcome[]` values, or
 * `undefined` when `'all'` is requested (omits the `outcomes` filter query param).
 */
export function resolveTestOutcomes(
  outcomes?: 'all' | ReadonlyArray<TestOutcomeName | number | string>,
): TestOutcome[] | undefined {
  if (outcomes === 'all') {
    return undefined;
  }

  const input = outcomes ?? DEFAULT_FAILURE_OUTCOMES;
  if (input.length === 0) {
    throw new AzureDevOpsValidationError(
      'outcomes must contain at least one valid TestOutcome or be set to "all".',
    );
  }

  const resolved: TestOutcome[] = [];
  const seen = new Set<TestOutcome>();

  for (const item of input) {
    let mapped: TestOutcome | undefined;
    if (typeof item === 'number') {
      if (Number.isInteger(item) && item >= 0 && item <= 14) {
        mapped = item;
      }
    } else if (typeof item === 'string') {
      const normalized = item.trim().toLowerCase();
      mapped = TEST_OUTCOME_BY_LOWER_NAME[normalized];
    }

    if (mapped === undefined) {
      throw new AzureDevOpsValidationError(
        `Invalid test outcome "${String(item)}". Valid outcomes are: Unspecified, None, Passed, Failed, Inconclusive, Timeout, Aborted, Blocked, NotExecuted, Warning, Error, NotApplicable, Paused, InProgress, NotImpacted (or numeric codes 0-14), or "all".`,
      );
    }

    if (!seen.has(mapped)) {
      seen.add(mapped);
      resolved.push(mapped);
    }
  }

  return resolved;
}

/**
 * Resolve `detailsToInclude` string into SDK `ResultDetails` enum value.
 */
export function resolveResultDetails(
  detailsToInclude?: ResultDetailsName | string,
): ResultDetails {
  if (detailsToInclude === undefined) {
    return ResultDetails.None;
  }
  const normalized = detailsToInclude.trim().toLowerCase();
  const mapped = RESULT_DETAILS_BY_LOWER_NAME[normalized];
  if (mapped === undefined) {
    throw new AzureDevOpsValidationError(
      `Invalid detailsToInclude "${detailsToInclude}". Valid values are: None, Iterations, WorkItems, SubResults, Point.`,
    );
  }
  return mapped;
}

/**
 * Compute per-run `$top` cap honoring Azure DevOps REST API hard limits:
 * <= 200 when detailsToInclude is non-None; <= 1000 otherwise.
 */
export function computePerRunTopLimit(
  maxResults: number,
  details: ResultDetails,
): number {
  const apiCap =
    details !== ResultDetails.None
      ? MAX_TOP_WITH_DETAILS
      : MAX_TOP_WITHOUT_DETAILS;
  const clampedMaxResults = Math.min(
    Math.max(1, Math.floor(maxResults)),
    MAX_TOTAL_RESULTS,
  );
  return Math.min(clampedMaxResults, apiCap);
}

function computeFailedTestsCount(run: TestRun): number {
  const explicitFailed = (run as TestRun & { failedTests?: unknown })
    .failedTests;
  if (typeof explicitFailed === 'number' && Number.isFinite(explicitFailed)) {
    return explicitFailed;
  }

  if (Array.isArray(run.runStatistics) && run.runStatistics.length > 0) {
    let failedFromStats = 0;
    for (const stat of run.runStatistics) {
      const outcome = stat.outcome?.toLowerCase();
      if (
        outcome &&
        FAILURE_STAT_OUTCOMES.has(outcome) &&
        typeof stat.count === 'number'
      ) {
        failedFromStats += stat.count;
      }
    }
    return failedFromStats;
  }

  if (
    typeof run.unanalyzedTests === 'number' &&
    Number.isFinite(run.unanalyzedTests)
  ) {
    return run.unanalyzedTests;
  }

  const total = run.totalTests ?? 0;
  const passed = run.passedTests ?? 0;
  const incomplete = run.incompleteTests ?? 0;
  const notApplicable = run.notApplicableTests ?? 0;
  return Math.max(0, total - passed - incomplete - notApplicable);
}

function summarizeTestRun(run: TestRun): BuildTestRunSummary {
  const summary: BuildTestRunSummary = {
    id: run.id,
    totalTests: run.totalTests ?? 0,
    passedTests: run.passedTests ?? 0,
    failedTests: computeFailedTestsCount(run),
    incompleteTests: run.incompleteTests ?? 0,
    notApplicableTests: run.notApplicableTests ?? 0,
  };

  if (run.name !== undefined) {
    summary.name = run.name;
  }
  if (run.state !== undefined) {
    summary.state = run.state;
  }
  if (typeof run.isAutomated === 'boolean') {
    summary.isAutomated = run.isAutomated;
  }
  const startedDate = formatDateValue(run.startedDate);
  if (startedDate !== undefined) {
    summary.startedDate = startedDate;
  }
  const completedDate = formatDateValue(run.completedDate);
  if (completedDate !== undefined) {
    summary.completedDate = completedDate;
  }
  if (run.url !== undefined) {
    summary.url = run.url;
  }

  return summary;
}

function mapFailingSince(
  failingSince: FailingSince | undefined,
): BuildTestResultFailingSince | undefined {
  if (!failingSince) {
    return undefined;
  }

  const mapped: BuildTestResultFailingSince = {};
  const date = formatDateValue(failingSince.date);
  if (date !== undefined) {
    mapped.date = date;
  }
  if (failingSince.build) {
    mapped.build = {
      ...(failingSince.build.id !== undefined
        ? { id: failingSince.build.id }
        : {}),
      ...(failingSince.build.number !== undefined
        ? { number: failingSince.build.number }
        : {}),
    };
  }
  if (failingSince.release) {
    mapped.release = {
      ...(failingSince.release.id !== undefined
        ? { id: failingSince.release.id }
        : {}),
      ...(failingSince.release.name !== undefined
        ? { name: failingSince.release.name }
        : {}),
    };
  }

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function mapAssociatedBugs(
  bugs: ShallowReference[] | undefined,
): BuildTestResultBugReference[] | undefined {
  if (!Array.isArray(bugs) || bugs.length === 0) {
    return undefined;
  }
  return bugs.map((bug) => ({
    ...(bug.id !== undefined ? { id: bug.id } : {}),
    ...(bug.name !== undefined ? { name: bug.name } : {}),
    ...(bug.url !== undefined ? { url: bug.url } : {}),
  }));
}

function extractTestResultItem(
  result: TestCaseResult,
  run: TestRun,
): BuildTestResultItem {
  const item: BuildTestResultItem = {
    runId: run.id,
  };

  if (result.id !== undefined) {
    item.id = result.id;
  }
  const runName = run.name ?? result.testRun?.name;
  if (runName !== undefined) {
    item.runName = runName;
  }
  if (result.testCaseTitle !== undefined && result.testCaseTitle !== null) {
    item.testCaseTitle = result.testCaseTitle;
  }
  if (
    result.automatedTestName !== undefined &&
    result.automatedTestName !== null
  ) {
    item.automatedTestName = result.automatedTestName;
  }
  if (
    result.automatedTestStorage !== undefined &&
    result.automatedTestStorage !== null
  ) {
    item.automatedTestStorage = result.automatedTestStorage;
  }
  if (result.outcome !== undefined && result.outcome !== null) {
    item.outcome = result.outcome;
  }
  if (result.errorMessage !== undefined && result.errorMessage !== null) {
    item.errorMessage = result.errorMessage;
  }
  if (result.stackTrace !== undefined && result.stackTrace !== null) {
    item.stackTrace = result.stackTrace;
  }
  if (typeof result.durationInMs === 'number') {
    item.durationInMs = result.durationInMs;
  }

  const failingSince = mapFailingSince(result.failingSince);
  if (failingSince !== undefined) {
    item.failingSince = failingSince;
  }

  const associatedBugs = mapAssociatedBugs(result.associatedBugs);
  if (associatedBugs !== undefined) {
    item.associatedBugs = associatedBugs;
  }

  return item;
}

/**
 * Retrieve test run summaries and filtered test results for a build/pipeline run
 * using the cross-platform Azure DevOps Test API (compatible with Server 2019 5.0+ and Services).
 */
export async function getBuildTestResults(
  connection: WebApi,
  options: GetBuildTestResultsOptions,
): Promise<BuildTestResultsResponse> {
  const projectId = resolvePipelineProjectId(options.projectId);
  const buildId = options.runId;

  const outcomeEnums = resolveTestOutcomes(options.outcomes);
  const detailsEnum = resolveResultDetails(options.detailsToInclude);

  const requestedMaxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  if (
    !Number.isInteger(requestedMaxResults) ||
    requestedMaxResults < 1 ||
    requestedMaxResults > MAX_TOTAL_RESULTS
  ) {
    throw new AzureDevOpsValidationError(
      `maxResults must be an integer between 1 and ${MAX_TOTAL_RESULTS}, received ${String(requestedMaxResults)}.`,
    );
  }

  const skip = options.skip ?? 0;
  if (!Number.isInteger(skip) || skip < 0) {
    throw new AzureDevOpsValidationError(
      `skip must be a non-negative integer, received ${String(skip)}.`,
    );
  }

  const topRuns = Math.min(
    Math.max(1, Math.floor(options.topRuns ?? DEFAULT_TOP_RUNS)),
    MAX_TOP_RUNS,
  );

  const perRunApiCap =
    detailsEnum !== ResultDetails.None
      ? MAX_TOP_WITH_DETAILS
      : MAX_TOP_WITHOUT_DETAILS;
  // Request up to maxResults + 1 when below the API cap so truncation is detected accurately
  // while strictly staying within the hard API $top ceiling (<= 200 with details, <= 1000 otherwise).
  const effectivePerRunTop = Math.min(requestedMaxResults + 1, perRunApiCap);

  try {
    const testApi = await connection.getTestApi();
    const buildUri = `vstfs:///Build/Build/${buildId}`;

    const runs = await testApi.getTestRuns(
      projectId,
      buildUri,
      undefined,
      undefined,
      undefined,
      true,
      undefined,
      0,
      topRuns,
    );

    // typed-rest-client resolves HTTP 404 Not Found to null instead of rejecting
    if (runs === null || runs === undefined) {
      throw new AzureDevOpsResourceNotFoundError(
        `Build ${buildId} not found in project '${projectId}'.`,
      );
    }

    const validRuns = runs.filter(
      (run): run is TestRun => typeof run?.id === 'number',
    );
    const runSummaries = validRuns.map(summarizeTestRun);

    const summary = {
      totalRuns: runSummaries.length,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      incompleteTests: 0,
      notApplicableTests: 0,
    };

    for (const runSummary of runSummaries) {
      summary.totalTests += runSummary.totalTests;
      summary.passedTests += runSummary.passedTests;
      summary.failedTests += runSummary.failedTests;
      summary.incompleteTests += runSummary.incompleteTests;
      summary.notApplicableTests += runSummary.notApplicableTests;
    }

    if (validRuns.length === 0) {
      return {
        buildId,
        projectId,
        summary,
        runs: [],
        results: [],
        truncated: false,
      };
    }

    const detailsArg =
      detailsEnum === ResultDetails.None ? undefined : detailsEnum;
    const skipArg = skip > 0 ? skip : undefined;

    const perRunResults = await mapWithConcurrency(
      validRuns,
      TEST_RESULTS_CONCURRENCY,
      async (run) => {
        const fetched = await testApi.getTestResults(
          projectId,
          run.id,
          detailsArg,
          skipArg,
          effectivePerRunTop,
          outcomeEnums,
        );
        const list = Array.isArray(fetched) ? fetched : [];
        return {
          run,
          results: list,
          hitPerRunCap: list.length >= effectivePerRunTop,
        };
      },
    );

    const allItems: BuildTestResultItem[] = [];
    let truncated = runs.length >= topRuns;

    for (const entry of perRunResults) {
      if (entry.hitPerRunCap) {
        truncated = true;
      }
      for (const result of entry.results) {
        if (allItems.length >= requestedMaxResults) {
          truncated = true;
          break;
        }
        allItems.push(extractTestResultItem(result, entry.run));
      }
      if (allItems.length >= requestedMaxResults && truncated) {
        break;
      }
    }

    return {
      buildId,
      projectId,
      summary,
      runs: runSummaries,
      results: allItems,
      truncated,
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    const statusCode = getErrorStatusCode(error);
    const message = error instanceof Error ? error.message : String(error);

    if (statusCode === 401 || /unauthorized|authentication/i.test(message)) {
      throw new AzureDevOpsAuthenticationError(
        `Failed to authenticate when fetching test results for build ${buildId}: ${message}`,
        { cause: error },
      );
    }

    if (statusCode === 403 || /forbidden|access denied/i.test(message)) {
      throw new AzureDevOpsPermissionError(
        `Permission denied when fetching test results for build ${buildId}: ${message}`,
        { cause: error },
      );
    }

    if (statusCode === 404 || /not found|does not exist/i.test(message)) {
      throw new AzureDevOpsResourceNotFoundError(
        `Build ${buildId} or project '${projectId}' not found: ${message}`,
        { cause: error },
      );
    }

    if (statusCode === 400) {
      throw new AzureDevOpsValidationError(
        `Invalid request while fetching test results for build ${buildId}: ${message}`,
        undefined,
        { cause: error },
      );
    }

    throw new AzureDevOpsError(
      `Failed to get test results for build ${buildId}: ${message}`,
      { cause: error },
    );
  }
}

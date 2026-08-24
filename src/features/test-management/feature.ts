import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors';
import { resolveAzureDevOpsBaseUrls } from '../../shared/azure-devops-url';

const TEST_MANAGEMENT_API_VERSION =
  process.env.AZURE_DEVOPS_API_VERSION ?? '7.0';

type QueryValue = string | number | boolean | undefined;

interface RestResponse<T> {
  result: T | null;
  headers?: Record<string, unknown>;
}

interface TestApiClient {
  createRequestOptions(contentType: string, apiVersion: string): unknown;
  rest: {
    get<T>(url: string, options: unknown): Promise<RestResponse<T>>;
    create<T>(url: string, body: unknown, options: unknown): Promise<RestResponse<T>>;
    update<T>(url: string, body: unknown, options: unknown): Promise<RestResponse<T>>;
  };
}

export interface ListTestPlansOptions {
  projectId: string;
  owner?: string;
  includePlanDetails: boolean;
  filterActivePlans: boolean;
  continuationToken?: string;
}

export interface ListTestSuitesOptions {
  projectId: string;
  planId: number;
  includeChildren: boolean;
  continuationToken?: string;
}

export interface ListSuiteTestCasesOptions {
  projectId: string;
  planId: number;
  suiteId: number;
  continuationToken?: string;
}

export interface ListTestPointsOptions {
  projectId: string;
  planId: number;
  suiteId: number;
  testCaseId?: number;
  skip: number;
  top: number;
}

export interface CreateTestRunOptions {
  projectId: string;
  name: string;
  planId: number;
  pointIds: number[];
  comment?: string;
}

export interface ListTestResultsOptions {
  projectId: string;
  runId: number;
  skip: number;
  top: number;
}

export interface UpdateTestResultsOptions {
  projectId: string;
  runId: number;
  results: Array<{
    id: number;
    outcome: string;
    comment?: string;
    errorMessage?: string;
    failureType?: string;
    stackTrace?: string;
    state?: 'Completed' | 'InProgress' | 'Pending';
  }>;
}

export interface CompleteTestRunOptions {
  projectId: string;
  runId: number;
  comment?: string;
  completedDate?: string;
}

export async function listTestPlans(
  connection: WebApi,
  options: ListTestPlansOptions,
): Promise<unknown> {
  return requestTestPlanApi(connection, options.projectId, 'get', 'plans', {
    owner: options.owner,
    includePlanDetails: options.includePlanDetails,
    filterActivePlans: options.filterActivePlans,
    continuationToken: options.continuationToken,
  });
}

export async function listTestSuites(
  connection: WebApi,
  options: ListTestSuitesOptions,
): Promise<unknown> {
  return requestTestPlanApi(
    connection,
    options.projectId,
    'get',
    `plans/${options.planId}/suites`,
    {
      asTreeView: options.includeChildren,
      continuationToken: options.continuationToken,
    },
  );
}

export async function listSuiteTestCases(
  connection: WebApi,
  options: ListSuiteTestCasesOptions,
): Promise<unknown> {
  return requestTestPlanApi(
    connection,
    options.projectId,
    'get',
    `plans/${options.planId}/suites/${options.suiteId}/testcase`,
    {
      continuationToken: options.continuationToken,
    },
  );
}

export async function listTestPoints(
  connection: WebApi,
  options: ListTestPointsOptions,
): Promise<unknown> {
  return requestTestApi(
    connection,
    options.projectId,
    'get',
    `plans/${options.planId}/suites/${options.suiteId}/points`,
    {
      testCaseId: options.testCaseId,
      $skip: options.skip,
      $top: options.top,
    },
  );
}

export async function createTestRun(
  connection: WebApi,
  options: CreateTestRunOptions,
): Promise<unknown> {
  return requestTestApi(connection, options.projectId, 'create', 'runs', {}, {
    name: options.name,
    plan: { id: String(options.planId) },
    pointIds: options.pointIds,
    automated: false,
    comment: options.comment,
  });
}

export async function listTestResults(
  connection: WebApi,
  options: ListTestResultsOptions,
): Promise<unknown> {
  return requestTestApi(
    connection,
    options.projectId,
    'get',
    `runs/${options.runId}/results`,
    { $skip: options.skip, $top: options.top },
  );
}

export async function updateTestResults(
  connection: WebApi,
  options: UpdateTestResultsOptions,
): Promise<unknown> {
  const results = options.results.map((result) => ({
    ...result,
    state: result.state ?? 'Completed',
  }));

  return requestTestApi(
    connection,
    options.projectId,
    'update',
    `runs/${options.runId}/results`,
    {},
    results,
  );
}

export async function completeTestRun(
  connection: WebApi,
  options: CompleteTestRunOptions,
): Promise<unknown> {
  return requestTestApi(
    connection,
    options.projectId,
    'update',
    `runs/${options.runId}`,
    {},
    {
      state: 'Completed',
      comment: options.comment,
      completedDate: options.completedDate,
    },
  );
}

async function requestTestPlanApi(
  connection: WebApi,
  projectId: string,
  method: 'get',
  path: string,
  query: Record<string, QueryValue>,
): Promise<unknown> {
  return request(connection, projectId, 'testplan', method, path, query);
}

async function requestTestApi(
  connection: WebApi,
  projectId: string,
  method: 'get' | 'create' | 'update',
  path: string,
  query: Record<string, QueryValue>,
  body?: unknown,
): Promise<unknown> {
  return request(connection, projectId, 'test', method, path, query, body);
}

async function request(
  connection: WebApi,
  projectId: string,
  area: 'test' | 'testplan',
  method: 'get' | 'create' | 'update',
  path: string,
  query: Record<string, QueryValue>,
  body?: unknown,
): Promise<unknown> {
  try {
    const testApi = (await connection.getTestApi()) as unknown as TestApiClient;
    const apiVersion = TEST_MANAGEMENT_API_VERSION;
    const baseUrls = resolveAzureDevOpsBaseUrls(connection.serverUrl, {
      projectId,
    });
    const url = new URL(
      `${encodeURIComponent(projectId)}/_apis/${area}/${path}`,
      `${baseUrls.coreBaseUrl.replace(/\/+$/, '')}/`,
    );
    url.searchParams.set('api-version', apiVersion);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const requestOptions = testApi.createRequestOptions(
      'application/json',
      apiVersion,
    );
    let response: RestResponse<unknown>;

    if (method === 'get') {
      response = await testApi.rest.get<unknown>(url.toString(), requestOptions);
    } else if (method === 'create') {
      response = await testApi.rest.create<unknown>(
        url.toString(),
        body,
        requestOptions,
      );
    } else {
      response = await testApi.rest.update<unknown>(
        url.toString(),
        body,
        requestOptions,
      );
    }

    return addContinuationToken(
      response.result ?? {},
      response.headers ?? {},
    );
  } catch (error) {
    throw asAzureDevOpsError(error);
  }
}

function addContinuationToken(
  result: unknown,
  headers: Record<string, unknown>,
): unknown {
  const continuationToken = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === 'x-ms-continuationtoken',
  )?.[1];
  const token = Array.isArray(continuationToken)
    ? continuationToken[0]
    : continuationToken;

  if (typeof token !== 'string' || token.length === 0) {
    return result;
  }

  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return { ...(result as Record<string, unknown>), continuationToken: token };
  }

  return { value: result, continuationToken: token };
}

function asAzureDevOpsError(error: unknown): AzureDevOpsError {
  if (error instanceof AzureDevOpsError) {
    return error;
  }

  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (statusCode === 401) {
    return new AzureDevOpsAuthenticationError(
      `Failed to authenticate to Azure Test Plans: ${message}`,
    );
  }
  if (statusCode === 403) {
    return new AzureDevOpsPermissionError(
      `Permission denied for Azure Test Plans: ${message}`,
    );
  }
  if (statusCode === 404) {
    return new AzureDevOpsResourceNotFoundError(
      `Azure Test Plans resource was not found: ${message}`,
    );
  }
  if (statusCode === 400) {
    return new AzureDevOpsValidationError(
      `Invalid Azure Test Plans request: ${message}`,
    );
  }

  return new AzureDevOpsError(`Azure Test Plans request failed: ${message}`);
}

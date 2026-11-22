import {
  SuiteExpand,
  TestSuiteType,
} from 'azure-devops-node-api/interfaces/TestPlanInterfaces';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors';
import { defaultProject } from '../../utils/environment';
import {
  SuiteExpandOption,
  TestCaseStepInput,
  TestSuiteTypeOption,
} from './types';

export const TEST_PLAN_AREA = 'testplan';
export const TEST_PLANS_LOCATION_ID = '0e292477-a0c2-47f3-a9b6-34f153d627f4';
export const TEST_SUITES_LOCATION_ID = '1046d5d3-ab61-4ca7-a65a-36118a978256';
export const SUITE_TEST_CASES_LOCATION_ID =
  'a9bd61ac-45cf-4d13-9441-43dcd01edf8d';

const NO_DEFAULT_PROJECT = 'no default project';

/**
 * Resolve projectId from explicit argument or configured AZURE_DEVOPS_DEFAULT_PROJECT.
 * Fails fast with AzureDevOpsValidationError if neither is configured.
 */
export function resolveProjectId(projectId?: string): string {
  const trimmed = projectId?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (defaultProject && defaultProject !== NO_DEFAULT_PROJECT) {
    return defaultProject;
  }
  throw new AzureDevOpsValidationError(
    'projectId is required (provide projectId or set AZURE_DEVOPS_DEFAULT_PROJECT)',
  );
}

/**
 * Map friendly string expand option to Azure DevOps SuiteExpand enum.
 */
export function mapSuiteExpand(
  expand?: SuiteExpandOption,
): SuiteExpand | undefined {
  switch (expand) {
    case 'none':
      return SuiteExpand.None;
    case 'children':
      return SuiteExpand.Children;
    case 'defaultTesters':
      return SuiteExpand.DefaultTesters;
    default:
      return undefined;
  }
}

/**
 * Map friendly string suite type to Azure DevOps TestSuiteType enum.
 */
export function mapSuiteType(suiteType: TestSuiteTypeOption): TestSuiteType {
  switch (suiteType) {
    case 'dynamicTestSuite':
      return TestSuiteType.DynamicTestSuite;
    case 'requirementTestSuite':
      return TestSuiteType.RequirementTestSuite;
    case 'staticTestSuite':
    default:
      return TestSuiteType.StaticTestSuite;
  }
}

/**
 * Deduplicate positive integer IDs while preserving order.
 */
export function deduplicateIds(ids: number[]): number[] {
  return Array.from(new Set(ids));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Encode structured test steps into Azure DevOps Microsoft.VSTS.TCM.Steps XML.
 * Step IDs must be sequential integers starting at 2 so Azure DevOps persists
 * step-level execution outcomes correctly.
 */
export function formatTestStepsXml(steps: TestCaseStepInput[]): string {
  if (steps.length === 0) {
    return '<steps id="0" last="1"></steps>';
  }

  const lastId = steps.length + 1;
  const stepElements = steps
    .map((step, index) => {
      const stepId = index + 2;
      const trimmedExpected = step.expectedResult?.trim() ?? '';
      const hasExpected = trimmedExpected !== '';
      const stepType = hasExpected ? 'ValidateStep' : 'ActionStep';
      const actionXml = escapeXml(`<P>${escapeXml(step.action)}</P>`);
      const expectedXml = hasExpected
        ? escapeXml(`<P>${escapeXml(trimmedExpected)}</P>`)
        : '';

      return (
        `<step id="${stepId}" type="${stepType}">` +
        `<parameterizedString isformatted="true">${actionXml}</parameterizedString>` +
        `<parameterizedString isformatted="true">${expectedXml}</parameterizedString>` +
        `<description/>` +
        `</step>`
      );
    })
    .join('');

  return `<steps id="0" last="${lastId}">${stepElements}</steps>`;
}

/**
 * Extract x-ms-continuationtoken from an Azure DevOps REST response headers map.
 */
export function extractContinuationToken(
  headers?: Record<string, unknown>,
): string | undefined {
  if (!headers) {
    return undefined;
  }
  const token =
    headers['x-ms-continuationtoken'] ?? headers['X-MS-ContinuationToken'];
  if (typeof token === 'string' && token.trim().length > 0) {
    return token.trim();
  }
  return undefined;
}

interface TestPlanRestClientLike {
  vsoClient?: {
    getVersioningData: (
      apiVersion: string,
      area: string,
      locationId: string,
      routeValues?: Record<string, unknown>,
      queryParams?: Record<string, unknown>,
    ) => Promise<{ requestUrl: string; apiVersion: string }>;
  };
  createRequestOptions?: (
    contentType: string,
    apiVersion: string,
  ) => Record<string, unknown>;
  rest?: {
    get: <T>(
      url: string,
      options?: Record<string, unknown>,
    ) => Promise<{
      statusCode?: number;
      result: T;
      headers?: Record<string, unknown>;
    }>;
  };
  formatResponse?: (
    data: unknown,
    typeInfo: unknown,
    isCollection: boolean,
  ) => unknown;
}

/**
 * Fetch a paginated TestPlanApi collection while preserving the
 * `x-ms-continuationtoken` header (which azure-devops-node-api's generated
 * PagedList methods discard). Falls back to the provided SDK call when
 * `vsoClient`/`rest` are absent (e.g., simplified unit-test mocks).
 */
export async function fetchPagedTestPlanCollection<T>(params: {
  testPlanApi: unknown;
  apiVersion: string;
  locationId: string;
  routeValues: Record<string, unknown>;
  queryParams: Record<string, unknown>;
  typeInfo: unknown;
  fallback: () => Promise<T[] | undefined>;
}): Promise<{ items: T[]; continuationToken?: string }> {
  const api = params.testPlanApi as TestPlanRestClientLike;

  if (
    api.vsoClient?.getVersioningData &&
    api.rest?.get &&
    api.createRequestOptions
  ) {
    const cleanQuery: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params.queryParams)) {
      if (v !== undefined) {
        cleanQuery[k] = v;
      }
    }

    const verData = await api.vsoClient.getVersioningData(
      params.apiVersion,
      TEST_PLAN_AREA,
      params.locationId,
      params.routeValues,
      cleanQuery,
    );
    const requestOptions = api.createRequestOptions(
      'application/json',
      verData.apiVersion,
    );
    const res = await api.rest.get<{ value?: T[] } | T[]>(
      verData.requestUrl,
      requestOptions,
    );

    if (res.statusCode === 404) {
      throw new AzureDevOpsResourceNotFoundError(
        `Requested test plan resource not found (${verData.requestUrl})`,
      );
    }

    const formatted = api.formatResponse
      ? (api.formatResponse(res.result, params.typeInfo, true) as T[])
      : Array.isArray(res.result)
        ? res.result
        : (res.result?.value ?? []);

    return {
      items: Array.isArray(formatted) ? formatted : [],
      continuationToken: extractContinuationToken(res.headers),
    };
  }

  const fallbackResult = await params.fallback();
  const continuationToken = (
    fallbackResult as (T[] & { continuationToken?: string }) | undefined
  )?.continuationToken;

  return {
    items: Array.isArray(fallbackResult) ? [...fallbackResult] : [],
    continuationToken,
  };
}

const ISO_DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * Strictly parse an ISO 8601 date (`YYYY-MM-DD`) or date-time with explicit
 * timezone offset (`YYYY-MM-DDTHH:mm:ss(.sss)?(Z|[+-]HH:mm)`).
 * Rejects non-ISO formats and impossible calendar dates (e.g. `2026-02-30`).
 */
export function parseStrictIsoDate(value: string): Date | null {
  const dateOnlyMatch = ISO_DATE_ONLY_REGEX.exec(value);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }
    return parsed;
  }

  const dateTimeMatch = ISO_DATETIME_REGEX.exec(value);
  if (dateTimeMatch) {
    const year = Number(dateTimeMatch[1]);
    const month = Number(dateTimeMatch[2]);
    const day = Number(dateTimeMatch[3]);
    const hour = Number(dateTimeMatch[4]);
    const minute = Number(dateTimeMatch[5]);
    const second = Number(dateTimeMatch[6]);

    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour > 23 ||
      minute > 59 ||
      second > 59
    ) {
      return null;
    }

    const calendarCheck = new Date(Date.UTC(year, month - 1, day));
    if (
      calendarCheck.getUTCFullYear() !== year ||
      calendarCheck.getUTCMonth() !== month - 1 ||
      calendarCheck.getUTCDate() !== day
    ) {
      return null;
    }

    if (dateTimeMatch[8] !== 'Z') {
      const offsetHour = Number(dateTimeMatch[10]);
      const offsetMinute = Number(dateTimeMatch[11]);
      if (offsetHour > 23 || offsetMinute > 59) {
        return null;
      }
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Returns true if the input is a valid strict ISO 8601 date or date-time string.
 */
export function isValidIsoDateString(value: string): boolean {
  return parseStrictIsoDate(value) !== null;
}

export type TestPlanPermissionScope =
  | 'test-read'
  | 'test-write'
  | 'work-item-write';

/**
 * Map Azure DevOps Test Plan API errors to typed AzureDevOpsError subclasses
 * without exposing credentials or raw request headers.
 */
export function mapTestPlanError(
  error: unknown,
  context: string,
  permissionScope: TestPlanPermissionScope = 'test-read',
): never {
  if (error instanceof AzureDevOpsError) {
    throw error;
  }

  const statusCode =
    typeof error === 'object' && error !== null
      ? ((error as { statusCode?: number }).statusCode ??
        (error as { response?: { status?: number } }).response?.status)
      : undefined;

  const message = error instanceof Error ? error.message : String(error);

  if (statusCode === 400 || statusCode === 409) {
    throw new AzureDevOpsValidationError(`${context}: ${message}`);
  }
  if (statusCode === 401) {
    throw new AzureDevOpsAuthenticationError(`${context}: ${message}`);
  }
  if (statusCode === 403) {
    let guidance: string;
    switch (permissionScope) {
      case 'work-item-write':
        guidance =
          'Verify your PAT has Work Items Read & Write permissions (vso.work_write).';
        break;
      case 'test-write':
        guidance =
          'Verify your PAT has Test Management Read & Write permissions (vso.test_write) and your user has a Basic + Test Plans (or Visual Studio Enterprise) license.';
        break;
      case 'test-read':
      default:
        guidance =
          'Verify your PAT has Test Management Read permissions (vso.test).';
        break;
    }
    throw new AzureDevOpsPermissionError(`${context}: ${message}. ${guidance}`);
  }
  if (statusCode === 404) {
    throw new AzureDevOpsResourceNotFoundError(`${context}: ${message}`);
  }

  throw new AzureDevOpsError(`${context}: ${message}`);
}

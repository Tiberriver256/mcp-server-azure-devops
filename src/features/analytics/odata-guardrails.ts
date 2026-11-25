import { randomUUID } from 'node:crypto';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsRateLimitError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors/index.ts';
import type { ApiErrorResponse } from '../../shared/errors/index.ts';
import {
  HttpError,
  buildRequestUrl,
  extractHeader,
  isHttpError,
  isSameOrigin,
  mapHttpErrorToAzureDevOpsError,
} from '../../shared/http/http-client.ts';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';
import {
  ALLOWED_ENTITY_SETS,
  DEFAULT_ANALYTICS_TOP,
  DEFAULT_SELECT_BY_ENTITY_SET,
  HIGH_CARDINALITY_GROUPBY_COLUMNS,
  MAX_ANALYTICS_COLUMNS,
  MAX_ANALYTICS_TOP,
  MAX_ODATA_GET_URL_LENGTH,
  SNAPSHOT_ENTITY_SETS,
} from './types.ts';
import type {
  AllowedEntitySet,
  AnalyticsScope,
  ODataVersion,
} from './types.ts';

const ALLOWED_ENTITY_SET_MAP: ReadonlyMap<string, AllowedEntitySet> = new Map(
  ALLOWED_ENTITY_SETS.map((name) => [name.toLowerCase(), name]),
);

const FORBIDDEN_PROTO_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const UNSUPPORTED_ODATA_OPERATORS: readonly {
  readonly label: string;
  readonly pattern: RegExp;
}[] = [
  { label: 'countdistinct', pattern: /\bcountdistinct\b/i },
  { label: '$search', pattern: /\$search\b/i },
  { label: '$crossjoin', pattern: /\$crossjoin\b/i },
  { label: '$rollup', pattern: /\$rollup\b/i },
  { label: 'topcount', pattern: /\btopcount\s*\(/i },
  { label: 'topsum', pattern: /\btopsum\s*\(/i },
  { label: 'toppercent', pattern: /\btoppercent\s*\(/i },
  { label: 'bottomcount', pattern: /\bbottomcount\s*\(/i },
  { label: 'bottomsum', pattern: /\bbottomsum\s*\(/i },
  { label: 'bottompercent', pattern: /\bbottompercent\s*\(/i },
  { label: 'isdefined', pattern: /\bisdefined\s*\(/i },
];

const ISO_DATETIME_LITERAL_RE =
  /(?<![0-9A-Za-z-])\d{4}-\d{2}-\d{2}(?:[Tt]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?([Zz]|[+-]\d{2}:\d{2})?(?![0-9A-Za-z-])/g;

/**
 * Strip single-quoted OData string literals (`'...'`, with `''` escapes) so
 * syntax/security validators inspect only OData operators and identifiers.
 */
export function stripODataSingleQuotes(expr: string): string {
  let out = '';
  let inQuote = false;
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (inQuote) {
      if (ch === "'") {
        if (expr[i + 1] === "'") {
          i += 1;
        } else {
          inQuote = false;
          out += "''";
        }
      }
    } else if (ch === "'") {
      inQuote = true;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Escape a string literal value for safe embedding inside OData `'...'` quotes.
 */
export function escapeODataStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Validate an `entitySet` identifier against path traversal, key addressing
 * (`WorkItems(123)`), query/fragment injection, and the known Analytics allowlist.
 */
export function validateEntitySet(rawEntitySet: string): AllowedEntitySet {
  const trimmed = rawEntitySet.trim();
  if (trimmed.length === 0) {
    throw new AzureDevOpsValidationError(
      `entitySet is required. Allowed entity sets: ${ALLOWED_ENTITY_SETS.join(', ')}`,
    );
  }

  if (/[()\\/?#\s]/.test(trimmed) || trimmed.includes('..')) {
    throw new AzureDevOpsValidationError(
      `Invalid entitySet '${trimmed}' (VS403483): entity key addressing (e.g. WorkItems(123)), property path addressing, path traversal ('..'), query characters, and whitespace are blocked in Analytics OData queries. Pass a plain entity set name (e.g. 'WorkItems') and use 'filter' instead.`,
    );
  }

  const canonical = ALLOWED_ENTITY_SET_MAP.get(trimmed.toLowerCase());
  if (!canonical) {
    throw new AzureDevOpsValidationError(
      `Invalid or unsupported entitySet '${trimmed}'. Allowed Azure DevOps Analytics entity sets: ${ALLOWED_ENTITY_SETS.join(', ')}`,
    );
  }

  return canonical;
}

/**
 * Validate an optional entitySet identifier for `$metadata` inspection without
 * restricting to the static allowlist (custom/future server entity sets still
 * work if they match safe identifier syntax).
 */
export function validateMetadataEntitySetName(rawEntitySet: string): string {
  const trimmed = rawEntitySet.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(trimmed)) {
    throw new AzureDevOpsValidationError(
      `Invalid entitySet '${trimmed}': must be a plain alphanumeric OData entity set identifier (no parentheses, slashes, '..', or query characters).`,
    );
  }
  return trimmed;
}

/**
 * Detect unquoted ISO date/datetime literals missing an explicit timezone
 * offset (`Z` or `±HH:MM`), which Azure DevOps Analytics rejects with `VS403494`.
 */
export function findDateTimeWithoutTimezone(expr?: string): string | undefined {
  if (!expr || expr.trim().length === 0) {
    return undefined;
  }
  const unquoted = stripODataSingleQuotes(expr);
  ISO_DATETIME_LITERAL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ISO_DATETIME_LITERAL_RE.exec(unquoted)) !== null) {
    if (!match[1]) {
      return match[0];
    }
  }
  return undefined;
}

/**
 * Normalize a list of `$select` column entries (supporting individual names
 * or comma-delimited entries) into trimmed non-empty column names.
 */
export function normalizeSelectColumns(
  select?: readonly string[] | string,
): string[] {
  if (!select) {
    return [];
  }
  const rawItems = typeof select === 'string' ? [select] : select;
  const cols: string[] = [];
  for (const item of rawItems) {
    for (const part of item.split(',')) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        cols.push(trimmed);
      }
    }
  }
  return cols;
}

function validateUnsupportedOperators(clauseName: string, expr?: string): void {
  if (!expr || expr.trim().length === 0) {
    return;
  }
  const unquoted = stripODataSingleQuotes(expr);
  for (const op of UNSUPPORTED_ODATA_OPERATORS) {
    if (op.pattern.test(unquoted)) {
      throw new AzureDevOpsValidationError(
        `Unsupported OData operator '${op.label}' in ${clauseName} (VS403483): Azure DevOps Analytics does not support ${op.label}.`,
      );
    }
  }
}

function validateHighCardinalityGroupBy(apply: string): void {
  const unquoted = stripODataSingleQuotes(apply);
  const groupByRe = /\bgroupby\s*\(\s*\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = groupByRe.exec(unquoted)) !== null) {
    const columns = match[1]
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    for (const col of columns) {
      const lower = col.toLowerCase();
      const segments = lower
        .split('/')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const protoSeg = segments.find((s) => FORBIDDEN_PROTO_KEYS.has(s));
      if (protoSeg) {
        throw new AzureDevOpsValidationError(
          `Invalid groupby property '${col}' (VS403483): forbidden property segment '${protoSeg}'.`,
        );
      }
      const leaf = segments[segments.length - 1] ?? lower;
      if (
        HIGH_CARDINALITY_GROUPBY_COLUMNS.has(lower) ||
        HIGH_CARDINALITY_GROUPBY_COLUMNS.has(leaf)
      ) {
        throw new AzureDevOpsValidationError(
          `Blocked high-cardinality groupby column '${col}' (VS403522): Azure DevOps Analytics rejects groupby() on unique key / high-cardinality fields such as WorkItemId, Title, PipelineRunId, or TestResultId. Group by lower-cardinality dimensions (e.g. State, WorkItemType, Area/AreaPath, DateSK) or use a filtered $select query instead.`,
        );
      }
    }
  }
}

function countExpandedSelectColumns(expand?: string): number {
  if (!expand || expand.trim().length === 0) {
    return 0;
  }
  const unquoted = stripODataSingleQuotes(expand);
  const nestedSelectRe = /\$select\s*=\s*([^;)]+)/gi;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = nestedSelectRe.exec(unquoted)) !== null) {
    count += match[1]
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0).length;
  }
  return count;
}

export interface ValidatedAnalyticsQuery {
  readonly entitySet: AllowedEntitySet;
  readonly selectColumns: readonly string[];
  readonly appliedDefaultSelect?: readonly string[];
  readonly filter?: string;
  readonly apply?: string;
  readonly expand?: string;
  readonly orderby?: string;
  readonly top: number;
  readonly skip?: number;
  readonly count?: boolean;
}

export interface RawAnalyticsQueryInput {
  readonly entitySet: string;
  readonly select?: readonly string[] | string;
  readonly filter?: string;
  readonly apply?: string;
  readonly expand?: string;
  readonly orderby?: string;
  readonly top?: number;
  readonly skip?: number;
  readonly count?: boolean;
}

/**
 * Run all client-side Poka-Yoke guardrails on a `query_analytics` request
 * BEFORE any HTTP call is issued.
 */
export function validateAnalyticsQuery(
  input: RawAnalyticsQueryInput,
): ValidatedAnalyticsQuery {
  // Guard #1: strict entitySet allowlist + block key addressing & traversal
  const entitySet = validateEntitySet(input.entitySet);

  const filter = input.filter?.trim() || undefined;
  const apply = input.apply?.trim() || undefined;
  const expand = input.expand?.trim() || undefined;
  const orderby = input.orderby?.trim() || undefined;

  // Guard #2: block non-aggregated queries on *Snapshot entities
  if (SNAPSHOT_ENTITY_SETS.has(entitySet)) {
    const unquotedApply = apply ? stripODataSingleQuotes(apply) : '';
    if (!apply || !/\baggregate\s*\(/i.test(unquotedApply)) {
      throw new AzureDevOpsValidationError(
        `Non-aggregated queries against snapshot entity '${entitySet}' are blocked (VS403483). Snapshot entities require a server-side $apply aggregation (for example: "groupby((DateSK,State),aggregate($count as ItemCount))").`,
      );
    }
  }

  // Guard #3: block $expand containing Revisions on WorkItems
  if (entitySet === 'WorkItems' && expand) {
    const unquotedExpand = stripODataSingleQuotes(expand);
    if (/\brevisions\b/i.test(unquotedExpand)) {
      throw new AzureDevOpsValidationError(
        `Expanding 'Revisions' on WorkItems is blocked by Azure DevOps Analytics (VS403483). Query the 'WorkItemRevisions' entity set directly instead (filtered by WorkItemId or RevisedDateSK).`,
      );
    }
  }

  // Guard #4: block unsupported OData clauses/functions across all query options
  validateUnsupportedOperators('apply', apply);
  validateUnsupportedOperators('filter', filter);
  validateUnsupportedOperators('expand', expand);
  validateUnsupportedOperators('orderby', orderby);

  // Guard #5: block high-cardinality unique-key groupby (VS403522)
  if (apply) {
    validateHighCardinalityGroupBy(apply);
  }

  // Guard #6: validate DateTimeOffset literals include timezone offset (VS403494)
  const badFilterDate = findDateTimeWithoutTimezone(filter);
  if (badFilterDate) {
    throw new AzureDevOpsValidationError(
      `DateTimeOffset literal '${badFilterDate}' in filter is missing a timezone offset (VS403494). Use ISO 8601 with explicit UTC 'Z' or offset '±HH:MM' (for example: '2026-11-01T00:00:00Z' or '2026-11-01T00:00:00+05:30').`,
    );
  }
  const badApplyDate = findDateTimeWithoutTimezone(apply);
  if (badApplyDate) {
    throw new AzureDevOpsValidationError(
      `DateTimeOffset literal '${badApplyDate}' in apply is missing a timezone offset (VS403494). Use ISO 8601 with explicit UTC 'Z' or offset '±HH:MM' (for example: '2026-11-01T00:00:00Z' or '2026-11-01T00:00:00+05:30').`,
    );
  }

  // Guard #7: column limit (<= 800, VS403670) + safe bounded default $select
  let selectColumns = normalizeSelectColumns(input.select);
  let appliedDefaultSelect: readonly string[] | undefined;

  if (selectColumns.length === 0 && !apply) {
    const defaults = DEFAULT_SELECT_BY_ENTITY_SET[entitySet];
    if (defaults && defaults.length > 0) {
      selectColumns = [...defaults];
      appliedDefaultSelect = defaults;
    } else {
      throw new AzureDevOpsValidationError(
        `Querying '${entitySet}' requires an explicit 'select' or 'apply' parameter to prevent exceeding Azure DevOps Analytics' 800-column limit (VS403670).`,
      );
    }
  }

  const totalSelectedColumns =
    selectColumns.length + countExpandedSelectColumns(expand);
  if (totalSelectedColumns > MAX_ANALYTICS_COLUMNS) {
    throw new AzureDevOpsValidationError(
      `Query selects ${totalSelectedColumns} columns, exceeding Azure DevOps Analytics' maximum limit of ${MAX_ANALYTICS_COLUMNS} columns (VS403670). Reduce columns in 'select' (and nested $select inside 'expand') to ${MAX_ANALYTICS_COLUMNS} or fewer.`,
    );
  }

  // Guard #8: hard $top cap (1..1000) and non-negative $skip
  const top = input.top ?? DEFAULT_ANALYTICS_TOP;
  if (!Number.isInteger(top) || top < 1 || top > MAX_ANALYTICS_TOP) {
    throw new AzureDevOpsValidationError(
      `Invalid 'top' value (${String(input.top)}): must be an integer between 1 and ${MAX_ANALYTICS_TOP} (max ${MAX_ANALYTICS_TOP} rows per query).`,
    );
  }

  if (
    input.skip !== undefined &&
    (!Number.isInteger(input.skip) || input.skip < 0)
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid 'skip' value (${String(input.skip)}): must be a non-negative integer.`,
    );
  }

  return {
    entitySet,
    selectColumns,
    appliedDefaultSelect,
    filter,
    apply,
    expand,
    orderby,
    top,
    skip: input.skip,
    count: input.count,
  };
}

/**
 * Validate a caller-supplied `@odata.nextLink` against the Analytics origin
 * before issuing any request (prevents SSRF and Authorization header leakage).
 */
export function validateSameOriginNextLink(
  nextLink: string,
  analyticsBaseUrl: string,
  expectedODataBaseUrl?: string,
  expectedEntitySet?: string,
): string {
  const trimmed = nextLink.trim();
  if (!isSameOrigin(trimmed, analyticsBaseUrl)) {
    throw new AzureDevOpsValidationError(
      `Rejected untrusted cross-origin nextLink: pagination URLs must share the exact same-origin scheme, host, and port as the configured Azure DevOps Analytics endpoint.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AzureDevOpsValidationError(
      `Invalid nextLink URL: expected a valid same-origin Azure DevOps OData pagination URL.`,
    );
  }

  if (!/\/_odata\//i.test(parsed.pathname)) {
    throw new AzureDevOpsValidationError(
      `Rejected untrusted nextLink: URL path must target an Azure DevOps Analytics '/_odata/' endpoint.`,
    );
  }

  if (expectedODataBaseUrl) {
    const basePath = new URL(expectedODataBaseUrl).pathname.replace(/\/+$/, '');
    const expectedPrefix = expectedEntitySet
      ? `${basePath}/${encodeURIComponent(expectedEntitySet)}`
      : `${basePath}/`;
    const normalizedPath = parsed.pathname.toLowerCase();
    const normalizedPrefix = expectedPrefix.toLowerCase();
    const matchesPrefix = expectedEntitySet
      ? normalizedPath === normalizedPrefix ||
        normalizedPath.startsWith(`${normalizedPrefix}/`)
      : normalizedPath.startsWith(normalizedPrefix);
    if (!matchesPrefix) {
      throw new AzureDevOpsValidationError(
        `Rejected out-of-scope nextLink: pagination URL must stay within the configured Analytics scope and entity set.`,
      );
    }
  }

  return trimmed;
}

/**
 * Build the Analytics OData base URL for either project scope (default) or
 * organization/collection scope.
 */
export function buildODataBaseUrl(params: {
  analyticsBaseUrl: string;
  scope: AnalyticsScope;
  projectId?: string;
  version: ODataVersion;
}): string {
  const cleanBase = params.analyticsBaseUrl.replace(/\/+$/, '');
  if (params.scope === 'project') {
    if (!params.projectId) {
      throw new AzureDevOpsValidationError(
        'projectId is required for project-scoped Analytics queries (provide projectId, set AZURE_DEVOPS_DEFAULT_PROJECT, or explicitly set scope: "organization").',
      );
    }
    return `${cleanBase}/${encodeURIComponent(params.projectId)}/_odata/${encodeURIComponent(params.version)}`;
  }
  return `${cleanBase}/_odata/${encodeURIComponent(params.version)}`;
}

/**
 * Build OData query parameters dictionary for a validated query.
 */
export function buildODataQueryParams(
  query: ValidatedAnalyticsQuery,
): Record<string, string | number | boolean | undefined> {
  return {
    $select:
      query.selectColumns.length > 0
        ? query.selectColumns.join(',')
        : undefined,
    $filter: query.filter,
    $apply: query.apply,
    $expand: query.expand,
    $orderby: query.orderby,
    $top: query.top,
    $skip: query.skip,
    $count: query.count ? 'true' : undefined,
  };
}

/**
 * Build a single-operation `multipart/mixed` OData v4 `$batch` request payload.
 * Azure DevOps Analytics allows at most 1 GET operation per `$batch` POST,
 * specifically to bypass the 3,000-character GET URL limit.
 */
export function buildSingleOpBatchPayload(relativeTargetUrl: string): {
  boundary: string;
  contentType: string;
  body: string;
} {
  const boundary = `batch_${randomUUID()}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/http\r\n` +
    `Content-Transfer-Encoding: binary\r\n\r\n` +
    `GET ${relativeTargetUrl} HTTP/1.1\r\n` +
    `Accept: application/json\r\n\r\n` +
    `--${boundary}--\r\n`;

  return {
    boundary,
    contentType: `multipart/mixed; boundary=${boundary}`,
    body,
  };
}

export interface ParsedBatchInnerResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly data: unknown;
}

/**
 * Parse a single-operation OData v4 `multipart/mixed` `$batch` response.
 */
export function parseSingleOpBatchResponse(
  responseBody: string,
  contentTypeHeader?: string,
): ParsedBatchInnerResponse {
  const ct = contentTypeHeader ?? '';
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(ct);
  let boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];

  if (!boundary) {
    const firstBoundaryMatch = /^--([^\r\n]+)/m.exec(responseBody);
    boundary = firstBoundaryMatch?.[1]?.trim();
  }

  if (!boundary) {
    throw new AzureDevOpsError(
      'Failed to parse OData $batch response: missing multipart boundary.',
    );
  }

  const rawParts = responseBody.split(`--${boundary}`);
  for (const rawPart of rawParts) {
    const trimmed = rawPart.trim();
    if (!trimmed || trimmed === '--') {
      continue;
    }

    const statusLineMatch =
      /HTTP\/1\.[01]\s+(\d{3})(?:[ \t]+([^\r\n]*))?/i.exec(trimmed);
    if (!statusLineMatch) {
      continue;
    }

    const status = Number.parseInt(statusLineMatch[1], 10);
    const statusText = (statusLineMatch[2] ?? '').trim();
    const afterStatus = trimmed.slice(
      statusLineMatch.index + statusLineMatch[0].length,
    );

    const headerBodySplit = /\r?\n\r?\n/.exec(afterStatus);
    const rawHeaders = headerBodySplit
      ? afterStatus.slice(0, headerBodySplit.index)
      : '';
    const rawInnerBody = headerBodySplit
      ? afterStatus.slice(headerBodySplit.index + headerBodySplit[0].length)
      : '';

    const headers: Record<string, string> = {};
    for (const line of rawHeaders.split(/\r?\n/)) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const val = line.slice(colonIdx + 1).trim();
        headers[key] = val;
      }
    }

    const bodyTrimmed = rawInnerBody.trim();
    let data: unknown = undefined;
    if (bodyTrimmed.length > 0) {
      try {
        data = JSON.parse(bodyTrimmed);
      } catch {
        data = bodyTrimmed;
      }
    }

    return {
      status,
      statusText,
      headers,
      data,
    };
  }

  throw new AzureDevOpsError(
    'Failed to parse OData $batch response: no inner HTTP response part found.',
  );
}

interface ExtractedODataErrorDetails {
  readonly code?: string;
  readonly message?: string;
  readonly apiData?: ApiErrorResponse;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractODataErrorDetails(
  responseData: unknown,
): ExtractedODataErrorDetails {
  if (!isPlainRecord(responseData)) {
    return {};
  }

  const apiData: ApiErrorResponse = { ...responseData };
  const nestedError = responseData.error;
  if (isPlainRecord(nestedError)) {
    const code =
      typeof nestedError.code === 'string' && nestedError.code.trim().length > 0
        ? nestedError.code.trim()
        : undefined;
    const message =
      typeof nestedError.message === 'string' &&
      nestedError.message.trim().length > 0
        ? nestedError.message.trim()
        : undefined;
    return { code, message, apiData };
  }

  const topMessage =
    typeof responseData.message === 'string' &&
    responseData.message.trim().length > 0
      ? responseData.message.trim()
      : undefined;

  return { message: topMessage, apiData };
}

function parseRetryAfter(headers: Record<string, string>): Date {
  const raw = extractHeader(headers, 'retry-after')?.trim();
  if (raw && raw.length > 0) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return new Date(Date.now() + seconds * 1000);
    }
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }
  return new Date(Date.now() + 60_000);
}

/**
 * Map an Azure DevOps Analytics HTTP error into an actionable `AzureDevOpsError`
 * with clear Analytics-specific guidance (404 disabled/extension/version,
 * 403 View analytics / vso.analytics, 429 throttling, TF400733 timeout, VS403* codes).
 */
export function mapAnalyticsHttpError(
  error: unknown,
  context: string,
  version: ODataVersion,
): AzureDevOpsError {
  if (error instanceof AzureDevOpsError) {
    return error;
  }

  if (isHttpError(error)) {
    const details = extractODataErrorDetails(error.responseData);
    const baseMessage = details.message ?? error.message;
    const combinedText = `${details.code ?? ''} ${baseMessage}`;

    if (/TF400733/i.test(combinedText)) {
      return new AzureDevOpsError(
        `Analytics query timed out while ${context} (TF400733): ${baseMessage}. Narrow the date range in 'filter', aggregate server-side with 'apply', or reduce '$expand' joins.`,
      );
    }

    switch (error.status) {
      case 400:
      case 412: {
        let hint = '';
        if (/VS403670/i.test(combinedText)) {
          hint =
            " Hint: Pass explicit 'select' (including nested $select in 'expand') with 800 or fewer columns.";
        } else if (/VS403494/i.test(combinedText)) {
          hint =
            " Hint: Include an explicit timezone offset ('Z' or '±HH:MM') on all DateTimeOffset literals.";
        } else if (/VS403522/i.test(combinedText)) {
          hint =
            ' Hint: Avoid grouping by high-cardinality unique key columns (such as WorkItemId or Title).';
        }
        return new AzureDevOpsValidationError(
          `Invalid Analytics OData query while ${context}: ${baseMessage}${hint}`,
          details.apiData,
        );
      }
      case 203:
      case 401:
        return new AzureDevOpsAuthenticationError(
          `Authentication failed while ${context}: ${baseMessage}. Verify your PAT or Microsoft Entra ID credentials.`,
        );
      case 403:
        return new AzureDevOpsPermissionError(
          `Permission denied while ${context} (HTTP 403): ${baseMessage}. Analytics requires the 'View analytics' project permission (Stakeholder access level is not permitted) and PAT scope 'Analytics (Read)' (vso.analytics). If using scope: 'organization', ensure access to all projects or switch to project scope.`,
        );
      case 404:
        return new AzureDevOpsResourceNotFoundError(
          `Analytics OData endpoint not available while ${context} (HTTP 404): ${baseMessage}. Analytics may not be enabled or installed on this server (Azure DevOps Server requires the Analytics extension), OData version '${version}' may not be supported (try 'v3.0-preview' or 'v2.0'), or the project/entitySet may not exist.`,
        );
      case 429:
        return new AzureDevOpsRateLimitError(
          `Analytics rate limit exceeded while ${context} (HTTP 429): ${baseMessage}. Reduce query volume, narrow date filters, or aggregate server-side with '$apply'.`,
          parseRetryAfter(error.headers),
        );
      case 503:
      case 504:
        return new AzureDevOpsError(
          `Analytics service temporarily unavailable or timed out while ${context} (HTTP ${error.status}): ${baseMessage}. Retry with a narrower date range or '$apply' aggregation.`,
        );
      default:
        return new AzureDevOpsError(
          `Analytics OData request failed while ${context} (HTTP ${error.status}): ${baseMessage}`,
        );
    }
  }

  if (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  ) {
    return new AzureDevOpsError(
      `Analytics query timed out while ${context} (TF400733 / client timeout): ${error.message}. Narrow the date range or aggregate server-side with '$apply'.`,
    );
  }

  return mapHttpErrorToAzureDevOpsError(error, context);
}

/**
 * Execute an authenticated Analytics HTTP request via `ctx.http`, using
 * `ctx.getAuthHeader()` and mapping failures through `mapAnalyticsHttpError`.
 */
export async function executeAnalyticsHttpRequest<T>(
  ctx: ToolContext,
  options: {
    method: 'GET' | 'POST';
    url: string;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
    body?: string;
    responseType: 'json' | 'text';
    context: string;
    version: ODataVersion;
  },
): Promise<{ status: number; headers: Record<string, string>; data: T }> {
  try {
    const authHeader = await ctx.getAuthHeader();
    return await ctx.http.request<T>({
      method: options.method,
      url: options.url,
      query: options.query,
      body: options.body,
      responseType: options.responseType,
      headers: {
        ...options.headers,
        Authorization: authHeader,
      },
    });
  } catch (error) {
    throw mapAnalyticsHttpError(error, options.context, options.version);
  }
}

/**
 * Execute a validated OData query either via direct GET (when <= 2,800 chars)
 * or transparently upgraded to a single-operation `POST .../$batch` (when
 * exceeding the GET URL limit, avoiding Azure DevOps' misleading 404).
 */
export async function executeODataQueryTransport(
  ctx: ToolContext,
  params: {
    odataBaseUrl: string;
    entitySet: string;
    query: Record<string, string | number | boolean | undefined>;
    version: ODataVersion;
    context: string;
  },
): Promise<{ payload: unknown; usedBatch: boolean }> {
  const entityUrl = `${params.odataBaseUrl}/${encodeURIComponent(params.entitySet)}`;
  const fullGetUrl = buildRequestUrl(entityUrl, params.query);

  if (fullGetUrl.length <= MAX_ODATA_GET_URL_LENGTH) {
    const response = await executeAnalyticsHttpRequest<unknown>(ctx, {
      method: 'GET',
      url: entityUrl,
      query: params.query,
      headers: {
        Accept: 'application/json',
      },
      responseType: 'json',
      context: params.context,
      version: params.version,
    });
    return { payload: response.data, usedBatch: false };
  }

  // Transparently upgrade overlong GET (>2,800 chars) to single-operation POST $batch
  const relativeTarget = buildRequestUrl(
    encodeURIComponent(params.entitySet),
    params.query,
  );
  const batchPayload = buildSingleOpBatchPayload(relativeTarget);
  const batchUrl = `${params.odataBaseUrl}/$batch`;

  const response = await executeAnalyticsHttpRequest<string>(ctx, {
    method: 'POST',
    url: batchUrl,
    body: batchPayload.body,
    headers: {
      'Content-Type': batchPayload.contentType,
      Accept: 'multipart/mixed, application/json',
    },
    responseType: 'text',
    context: `${params.context} via $batch`,
    version: params.version,
  });

  const inner = parseSingleOpBatchResponse(
    response.data,
    extractHeader(response.headers, 'content-type'),
  );

  if (inner.status >= 400) {
    throw mapAnalyticsHttpError(
      new HttpError({
        message: `HTTP ${inner.status} ${inner.statusText || 'Error'}`.trim(),
        status: inner.status,
        statusText: inner.statusText,
        url: batchUrl,
        responseData: inner.data,
        headers: inner.headers,
      }),
      `${params.context} via $batch`,
      params.version,
    );
  }

  return { payload: inner.data, usedBatch: true };
}

import { AzureDevOpsError } from '../../../shared/errors/index.ts';
import { HttpError, extractHeader } from '../../../shared/http/http-client.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import {
  buildODataBaseUrl,
  buildODataQueryParams,
  buildSingleOpBatchPayload,
  executeAnalyticsHttpRequest,
  executeODataQueryTransport,
  mapAnalyticsHttpError,
  parseSingleOpBatchResponse,
  validateAnalyticsQuery,
  validateEntitySet,
  validateNextLinkQueryOptions,
  validateSameOriginNextLink,
} from '../odata-guardrails.ts';
import type { QueryAnalyticsInput } from '../schemas.ts';
import { DEFAULT_ODATA_VERSION, MAX_ODATA_GET_URL_LENGTH } from '../types.ts';
import type {
  AnalyticsScope,
  ODataVersion,
  QueryAnalyticsResult,
} from '../types.ts';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRows(rawValue: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rawValue)) {
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const item of rawValue) {
    if (isPlainRecord(item)) {
      rows.push(item);
    }
  }
  return rows;
}

function formatODataQueryResult(params: {
  payload: unknown;
  entitySet: string;
  scope: AnalyticsScope;
  projectId?: string;
  version: ODataVersion;
  analyticsBaseUrl: string;
  odataBaseUrl: string;
  usedBatch: boolean;
  appliedDefaultSelect?: readonly string[];
}): QueryAnalyticsResult {
  if (!isPlainRecord(params.payload)) {
    throw new AzureDevOpsError(
      `Unexpected non-object OData response from Analytics entitySet '${params.entitySet}'.`,
    );
  }

  const rows = normalizeRows(params.payload.value);
  const odataContext =
    typeof params.payload['@odata.context'] === 'string'
      ? params.payload['@odata.context']
      : undefined;
  const odataCount =
    typeof params.payload['@odata.count'] === 'number' &&
    Number.isFinite(params.payload['@odata.count'])
      ? params.payload['@odata.count']
      : undefined;

  const warnings: string[] = [];
  let safeNextLink: string | undefined;
  let nextLinkBlocked = false;

  const rawNextLink = params.payload['@odata.nextLink'];
  if (typeof rawNextLink === 'string' && rawNextLink.trim().length > 0) {
    try {
      safeNextLink = validateSameOriginNextLink(
        rawNextLink,
        params.analyticsBaseUrl,
        params.odataBaseUrl,
        params.entitySet,
      );
    } catch {
      nextLinkBlocked = true;
      warnings.push(
        'Stripped untrusted cross-origin or out-of-scope @odata.nextLink from Analytics response.',
      );
    }
  }

  return {
    entitySet: params.entitySet,
    scope: params.scope,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    version: params.version,
    ...(odataContext !== undefined ? { '@odata.context': odataContext } : {}),
    ...(odataCount !== undefined ? { '@odata.count': odataCount } : {}),
    ...(safeNextLink !== undefined ? { '@odata.nextLink': safeNextLink } : {}),
    ...(nextLinkBlocked ? { nextLinkBlocked: true } : {}),
    ...(params.usedBatch ? { usedBatch: true } : {}),
    ...(params.appliedDefaultSelect
      ? { appliedDefaultSelect: params.appliedDefaultSelect }
      : {}),
    returnedCount: rows.length,
    value: rows,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function fetchValidatedNextLink(
  ctx: ToolContext,
  params: {
    safeNextLink: string;
    odataBaseUrl: string;
    version: ODataVersion;
    context: string;
  },
): Promise<{ payload: unknown; usedBatch: boolean }> {
  if (params.safeNextLink.length <= MAX_ODATA_GET_URL_LENGTH) {
    const response = await executeAnalyticsHttpRequest<unknown>(ctx, {
      method: 'GET',
      url: params.safeNextLink,
      headers: {
        Accept: 'application/json',
      },
      responseType: 'json',
      context: params.context,
      version: params.version,
    });
    return { payload: response.data, usedBatch: false };
  }

  const parsed = new URL(params.safeNextLink);
  const basePrefix = `${new URL(params.odataBaseUrl).pathname.replace(/\/+$/, '')}/`;
  const serviceRelativePath = parsed.pathname
    .toLowerCase()
    .startsWith(basePrefix.toLowerCase())
    ? parsed.pathname.slice(basePrefix.length)
    : parsed.pathname.replace(/^\/+/, '');
  const relativeTarget = `${serviceRelativePath}${parsed.search}`;
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

/**
 * Execute a guarded Azure DevOps Analytics OData v4 query with full
 * client-side Poka-Yoke validation, automatic single-op `$batch` fallback for
 * >2,800-char GET URLs, and strict same-origin `@odata.nextLink` enforcement.
 */
export async function queryAnalytics(
  ctx: ToolContext,
  input: QueryAnalyticsInput,
): Promise<QueryAnalyticsResult> {
  const scope = input.scope ?? 'project';
  const version = input.version ?? DEFAULT_ODATA_VERSION;
  const projectId =
    scope === 'project' ? ctx.resolveProjectId(input.projectId) : undefined;
  const baseUrls = input.organizationId
    ? ctx.resolveBaseUrls({ organizationId: input.organizationId })
    : ctx.baseUrls;

  const odataBaseUrl = buildODataBaseUrl({
    analyticsBaseUrl: baseUrls.analyticsBaseUrl,
    scope,
    projectId,
    version,
  });

  if (input.nextLink !== undefined && input.nextLink.trim().length > 0) {
    const canonicalEntitySet = validateEntitySet(input.entitySet);
    const safeNextLink = validateSameOriginNextLink(
      input.nextLink,
      baseUrls.analyticsBaseUrl,
      odataBaseUrl,
      canonicalEntitySet,
    );
    validateNextLinkQueryOptions(safeNextLink, canonicalEntitySet);
    const { payload, usedBatch } = await fetchValidatedNextLink(ctx, {
      safeNextLink,
      odataBaseUrl,
      version,
      context: `fetching nextLink page for Analytics entitySet '${canonicalEntitySet}'`,
    });
    return formatODataQueryResult({
      payload,
      entitySet: canonicalEntitySet,
      scope,
      projectId,
      version,
      analyticsBaseUrl: baseUrls.analyticsBaseUrl,
      odataBaseUrl,
      usedBatch,
    });
  }

  const validated = validateAnalyticsQuery(input);
  const query = buildODataQueryParams(validated);
  const { payload, usedBatch } = await executeODataQueryTransport(ctx, {
    odataBaseUrl,
    entitySet: validated.entitySet,
    query,
    version,
    context: `querying Analytics entitySet '${validated.entitySet}'`,
  });

  return formatODataQueryResult({
    payload,
    entitySet: validated.entitySet,
    scope,
    projectId,
    version,
    analyticsBaseUrl: baseUrls.analyticsBaseUrl,
    odataBaseUrl,
    usedBatch,
    appliedDefaultSelect: validated.appliedDefaultSelect,
  });
}

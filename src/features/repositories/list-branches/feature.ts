import type { WebApi } from 'azure-devops-node-api';
import type {
  GitBranchStats,
  GitRef,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { TypeInfo } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { extractContinuationToken } from '../../../shared/http/http-client.ts';
import type {
  BranchInfo,
  ListBranchesOptions,
  ListBranchesResponse,
} from '../types.ts';

const GIT_AREA = 'git';
const GIT_REFS_LOCATION_ID = '2d874a60-a811-4f62-9c9f-963a6ea0a55b';
const GIT_REFS_API_VERSION = '7.2-preview.2';
const REFS_HEADS_PREFIX = /^refs\/heads\//;

interface GitRefsRestClientLike {
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

function isGitRefsRestClient(value: unknown): value is GitRefsRestClientLike {
  return typeof value === 'object' && value !== null;
}

function isArrayOf<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Normalize an optional branch prefix filter to Azure DevOps' `heads/...` format
 * without ever producing double `heads/heads/` or `heads/refs/heads/` prefixes.
 */
export function normalizeBranchFilter(filter?: string): string {
  const trimmed = filter?.trim() ?? '';
  if (!trimmed) {
    return 'heads/';
  }
  const withoutRefs = trimmed.replace(/^refs\//i, '');
  const withoutHeads = withoutRefs.replace(/^heads\//i, '');
  return `heads/${withoutHeads}`;
}

/**
 * Return true when the negotiated API version is below 6.0 (e.g., Azure DevOps
 * Server 2019 RTM `5.0`), where `$top` and `continuationToken` are unsupported
 * on Git Refs endpoints.
 */
export function isLegacyRefsApiVersion(apiVersion?: string): boolean {
  if (!apiVersion) {
    return false;
  }
  const match = /^(\d+)\./.exec(apiVersion.trim());
  if (!match) {
    return false;
  }
  return Number(match[1]) < 6;
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const err = error as {
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  if (typeof err.statusCode === 'number') {
    return err.statusCode;
  }
  if (typeof err.response?.status === 'number') {
    return err.response.status;
  }
  return undefined;
}

function stripLegacyPaginationParams(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.delete('$top');
    parsed.searchParams.delete('continuationToken');
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function normalizeBranchRef(ref: GitRef): BranchInfo {
  const refName = ref.name ?? '';
  const name = refName.replace(REFS_HEADS_PREFIX, '');
  return {
    name,
    refName,
    ...(ref.objectId !== undefined ? { objectId: ref.objectId } : {}),
    ...(ref.creator !== undefined ? { creator: ref.creator } : {}),
    isLocked: Boolean(ref.isLocked),
    ...(ref.isLockedBy !== undefined ? { isLockedBy: ref.isLockedBy } : {}),
    ...(ref.statuses !== undefined ? { statuses: ref.statuses } : {}),
  };
}

/**
 * List Git branches in an Azure DevOps repository with prefix/substring filters,
 * `includeMyBranches`, status checks, `$top`/`x-ms-continuationtoken` pagination,
 * Server 2019 RTM (`5.0`) graceful negotiation, and optional `stats/branches` enrichment.
 */
export async function listBranches(
  connection: WebApi,
  options: ListBranchesOptions,
): Promise<ListBranchesResponse> {
  try {
    const repositoryId = options.repositoryId?.trim();
    if (!repositoryId) {
      throw new AzureDevOpsValidationError('repositoryId is required');
    }

    const hasFilter =
      typeof options.filter === 'string' && options.filter.trim().length > 0;
    if (options.includeMyBranches === true && hasFilter) {
      throw new AzureDevOpsValidationError(
        'Cannot combine filter with includeMyBranches: true (mutually exclusive in Azure DevOps Git Refs API)',
      );
    }

    if (
      options.latestStatusesOnly === true &&
      options.includeStatuses !== true
    ) {
      throw new AzureDevOpsValidationError(
        'latestStatusesOnly requires includeStatuses to be true',
      );
    }

    if (
      options.top !== undefined &&
      (!Number.isInteger(options.top) || options.top < 1 || options.top > 1000)
    ) {
      throw new AzureDevOpsValidationError(
        `Invalid top value '${options.top}'. Must be an integer between 1 and 1000.`,
      );
    }

    const gitApi = await connection.getGitApi();
    const restApi = isGitRefsRestClient(gitApi) ? gitApi : undefined;

    // CRITICAL: omit `filter` completely when `includeMyBranches: true`
    const wireFilter =
      options.includeMyBranches === true
        ? undefined
        : normalizeBranchFilter(options.filter);

    let refs: GitRef[];
    let continuationToken: string | undefined;

    if (
      restApi?.vsoClient?.getVersioningData &&
      restApi.rest?.get &&
      restApi.createRequestOptions
    ) {
      const queryParams: Record<string, unknown> = {};
      if (wireFilter !== undefined) {
        queryParams.filter = wireFilter;
      }
      if (options.filterContains !== undefined) {
        queryParams.filterContains = options.filterContains;
      }
      if (options.includeMyBranches !== undefined) {
        queryParams.includeMyBranches = options.includeMyBranches;
      }
      if (options.includeStatuses !== undefined) {
        queryParams.includeStatuses = options.includeStatuses;
      }
      if (options.latestStatusesOnly !== undefined) {
        queryParams.latestStatusesOnly = options.latestStatusesOnly;
      }
      if (options.top !== undefined) {
        queryParams.$top = options.top;
      }
      if (options.continuationToken !== undefined) {
        queryParams.continuationToken = options.continuationToken;
      }

      const verData = await restApi.vsoClient.getVersioningData(
        GIT_REFS_API_VERSION,
        GIT_AREA,
        GIT_REFS_LOCATION_ID,
        {
          project: options.projectId,
          repositoryId,
        },
        queryParams,
      );

      if (!verData.requestUrl || !verData.apiVersion) {
        throw new AzureDevOpsError(
          `Unable to resolve Git refs endpoint URL for repository '${repositoryId}'`,
        );
      }

      const requestUrl = isLegacyRefsApiVersion(verData.apiVersion)
        ? stripLegacyPaginationParams(verData.requestUrl)
        : verData.requestUrl;

      const requestOptions = restApi.createRequestOptions(
        'application/json',
        verData.apiVersion,
      );

      const res = await restApi.rest.get<{ value?: GitRef[] } | GitRef[]>(
        requestUrl,
        requestOptions,
      );

      if (res.statusCode === 404) {
        throw new AzureDevOpsResourceNotFoundError(
          `Repository '${repositoryId}' not found in project '${options.projectId}'`,
        );
      }

      const formatted: unknown = restApi.formatResponse
        ? restApi.formatResponse(res.result, TypeInfo.GitRef, true)
        : Array.isArray(res.result)
          ? res.result
          : (res.result?.value ?? []);

      refs = isArrayOf<GitRef>(formatted) ? formatted : [];
      continuationToken = extractContinuationToken(res.headers);
    } else {
      refs =
        (await gitApi.getRefs(
          repositoryId,
          options.projectId,
          wireFilter,
          undefined,
          options.includeStatuses,
          options.includeMyBranches,
          options.latestStatusesOnly,
          undefined,
          options.filterContains,
        )) ?? [];
    }

    const headRefs = refs.filter(
      (ref) => typeof ref.name === 'string' && REFS_HEADS_PREFIX.test(ref.name),
    );
    const branches: BranchInfo[] = headRefs.map(normalizeBranchRef);

    if (options.includeStats === true && branches.length > 0) {
      const statsList =
        (await gitApi.getBranches(repositoryId, options.projectId)) ?? [];
      const statsByName = new Map<string, GitBranchStats>();
      for (const stat of statsList) {
        if (stat?.name) {
          const cleanName = stat.name.replace(REFS_HEADS_PREFIX, '');
          statsByName.set(cleanName, stat);
        }
      }

      for (const branch of branches) {
        const stat = statsByName.get(branch.name);
        if (stat) {
          if (stat.aheadCount !== undefined) {
            branch.aheadCount = stat.aheadCount;
          }
          if (stat.behindCount !== undefined) {
            branch.behindCount = stat.behindCount;
          }
          if (stat.isBaseVersion !== undefined) {
            branch.isBaseVersion = stat.isBaseVersion;
          }
          if (stat.commit !== undefined) {
            branch.commit = stat.commit;
          }
        }
      }
    }

    return {
      branches,
      count: branches.length,
      ...(continuationToken !== undefined ? { continuationToken } : {}),
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    const statusCode = extractStatusCode(error);
    const message = error instanceof Error ? error.message : String(error);

    switch (statusCode) {
      case 400:
      case 409:
        throw new AzureDevOpsValidationError(
          `Failed to list branches for repository '${options.repositoryId}': ${message}`,
          { statusCode, message },
          { cause: error },
        );
      case 401:
        throw new AzureDevOpsAuthenticationError(
          `Authentication failed while listing branches for repository '${options.repositoryId}': ${message}`,
          { cause: error },
        );
      case 403:
        throw new AzureDevOpsPermissionError(
          `Permission denied while listing branches for repository '${options.repositoryId}': ${message}. Verify your PAT has Code Read permissions (vso.code).`,
          { cause: error },
        );
      case 404:
        throw new AzureDevOpsResourceNotFoundError(
          `Repository '${options.repositoryId}' or project '${options.projectId}' not found: ${message}`,
          { cause: error },
        );
      default:
        throw new AzureDevOpsError(
          `Failed to list branches for repository '${options.repositoryId}': ${message}`,
          { cause: error },
        );
    }
  }
}

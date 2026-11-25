import type { IGitApi } from 'azure-devops-node-api/GitApi.js';
import type { IdentityRefWithVote } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import { resolveIdentityId } from '../../../shared/session/identity-resolver.ts';
import type {
  ManagePullRequestReviewersOptions,
  ManagePullRequestReviewersResponse,
  ReviewerInput,
  ReviewerMutationResult,
} from '../types.ts';

const GIT_AREA = 'git';
const PR_REVIEWERS_LOCATION_ID = '4b6702c7-aa35-4b89-9c96-b9abf6d3e540';
const PR_REVIEWERS_API_VERSION = '7.2-preview.1';

interface NormalizedReviewerEntry {
  input: string;
  isRequired?: boolean;
}

interface GitApiRestClientLike {
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
    del: <T>(
      url: string,
      options?: Record<string, unknown>,
    ) => Promise<{
      statusCode?: number;
      result: T;
      headers?: Record<string, unknown>;
    }>;
  };
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

function mapReviewerError(error: unknown, context: string): AzureDevOpsError {
  if (error instanceof AzureDevOpsError) {
    return error;
  }

  const statusCode = extractStatusCode(error);
  const message = error instanceof Error ? error.message : String(error);

  switch (statusCode) {
    case 400:
    case 409:
      return new AzureDevOpsValidationError(
        `${context}: ${message}`,
        { statusCode, message },
        { cause: error },
      );
    case 401:
      return new AzureDevOpsAuthenticationError(`${context}: ${message}`, {
        cause: error,
      });
    case 403:
      return new AzureDevOpsPermissionError(
        `${context}: ${message}. Verify your PAT has Code Read & Write permissions (vso.code_write).`,
        { cause: error },
      );
    case 404:
      return new AzureDevOpsResourceNotFoundError(`${context}: ${message}`, {
        cause: error,
      });
    default:
      return new AzureDevOpsError(`${context}: ${message}`, { cause: error });
  }
}

function collectReviewerEntries(
  options: ManagePullRequestReviewersOptions,
): NormalizedReviewerEntry[] {
  const entries: NormalizedReviewerEntry[] = [];

  if (Array.isArray(options.reviewers)) {
    for (const raw of options.reviewers) {
      const normalized = normalizeReviewerInput(raw);
      if (normalized) {
        entries.push(normalized);
      }
    }
  }

  if (typeof options.reviewerId === 'string' && options.reviewerId.trim()) {
    entries.push({
      input: options.reviewerId.trim(),
      isRequired: options.isRequired,
    });
  }

  return entries;
}

function normalizeReviewerInput(
  raw: ReviewerInput,
): NormalizedReviewerEntry | undefined {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? { input: trimmed } : undefined;
  }

  const identifier = (raw.id ?? raw.reviewer)?.trim();
  if (!identifier) {
    return undefined;
  }

  return {
    input: identifier,
    isRequired: raw.isRequired,
  };
}

function isGitApiRestClient(value: unknown): value is GitApiRestClientLike {
  return typeof value === 'object' && value !== null;
}

/**
 * Delete a reviewer while explicitly surfacing HTTP 404 (typed-rest-client
 * resolves `rest.del()` to `null` on 404 instead of throwing, which would
 * otherwise hide missing-reviewer failures in `gitApi.deletePullRequestReviewer`).
 */
async function deletePullRequestReviewerStrict(
  gitApi: IGitApi,
  repositoryId: string,
  pullRequestId: number,
  reviewerId: string,
  projectId?: string,
): Promise<void> {
  const restApi = isGitApiRestClient(gitApi) ? gitApi : undefined;
  if (
    restApi?.vsoClient?.getVersioningData &&
    restApi.rest?.del &&
    restApi.createRequestOptions
  ) {
    const verData = await restApi.vsoClient.getVersioningData(
      PR_REVIEWERS_API_VERSION,
      GIT_AREA,
      PR_REVIEWERS_LOCATION_ID,
      {
        project: projectId,
        repositoryId,
        pullRequestId,
        reviewerId,
      },
    );
    if (!verData.requestUrl || !verData.apiVersion) {
      throw new AzureDevOpsError(
        `Unable to resolve pull request reviewers endpoint URL for pull request ${pullRequestId}`,
      );
    }
    const requestOptions = restApi.createRequestOptions(
      'application/json',
      verData.apiVersion,
    );
    const res = await restApi.rest.del<unknown>(
      verData.requestUrl,
      requestOptions,
    );
    if (res.statusCode === 404) {
      throw new AzureDevOpsResourceNotFoundError(
        `Reviewer '${reviewerId}' not found on pull request ${pullRequestId} (404)`,
      );
    }
    if (res.statusCode !== undefined && res.statusCode >= 400) {
      throw new AzureDevOpsError(
        `Failed to remove reviewer '${reviewerId}' from pull request ${pullRequestId} (HTTP ${res.statusCode})`,
      );
    }
    return;
  }

  await gitApi.deletePullRequestReviewer(
    repositoryId,
    pullRequestId,
    reviewerId,
    projectId,
  );
}

/**
 * List, add, update, or remove reviewers on an Azure DevOps pull request.
 * Resolves email/name reviewer identifiers across Cloud and On-Prem Server while
 * rejecting ambiguous or unknown identities cleanly without mutating the PR.
 */
export async function managePullRequestReviewers(
  ctx: ToolContext,
  options: ManagePullRequestReviewersOptions,
): Promise<ManagePullRequestReviewersResponse> {
  try {
    const connection = await ctx.getWebApi(options.organizationId);
    const gitApi = await connection.getGitApi();
    const projectId = ctx.resolveOptionalProjectId(options.projectId);

    let resolvedRepositoryId = options.repositoryId;
    let resolvedProjectId = projectId;

    if (!resolvedRepositoryId) {
      const pr = await gitApi.getPullRequestById(
        options.pullRequestId,
        projectId,
      );
      if (!pr) {
        throw new AzureDevOpsResourceNotFoundError(
          `Pull request ${options.pullRequestId} not found`,
        );
      }
      resolvedRepositoryId = pr.repository?.id;
      resolvedProjectId = projectId ?? pr.repository?.project?.id;
      if (!resolvedRepositoryId) {
        throw new AzureDevOpsValidationError(
          `Unable to determine repositoryId for pull request ${options.pullRequestId}`,
        );
      }
    }

    if (options.action === 'list') {
      const reviewers = await gitApi.getPullRequestReviewers(
        resolvedRepositoryId,
        options.pullRequestId,
        resolvedProjectId,
      );
      if (reviewers === null || reviewers === undefined) {
        throw new AzureDevOpsResourceNotFoundError(
          `Pull request ${options.pullRequestId} in repository '${resolvedRepositoryId}' was not found`,
        );
      }

      return {
        action: 'list',
        pullRequestId: options.pullRequestId,
        repositoryId: resolvedRepositoryId,
        count: reviewers.length,
        reviewers,
      };
    }

    const entries = collectReviewerEntries(options);
    if (entries.length === 0) {
      throw new AzureDevOpsValidationError(
        `Action '${options.action}' requires at least one reviewer via 'reviewers' or 'reviewerId'`,
      );
    }

    const results: ReviewerMutationResult[] = [];
    const rawErrors: AzureDevOpsError[] = [];

    for (const entry of entries) {
      let resolvedId: string | undefined;
      try {
        const identity = await resolveIdentityId(
          ctx,
          entry.input,
          options.organizationId,
        );
        resolvedId = identity.id;

        if (options.action === 'add' || options.action === 'update') {
          let effectiveIsRequired = entry.isRequired ?? options.isRequired;

          if (
            effectiveIsRequired === undefined &&
            options.action === 'update'
          ) {
            let existing: IdentityRefWithVote | null | undefined;
            try {
              existing = await gitApi.getPullRequestReviewer(
                resolvedRepositoryId,
                options.pullRequestId,
                resolvedId,
                resolvedProjectId,
              );
            } catch (lookupError) {
              if (extractStatusCode(lookupError) !== 404) {
                throw lookupError;
              }
              existing = undefined;
            }
            effectiveIsRequired = Boolean(existing?.isRequired);
          } else if (effectiveIsRequired === undefined) {
            effectiveIsRequired = false;
          }

          const updatedReviewer = await gitApi.createPullRequestReviewer(
            {
              id: resolvedId,
              isRequired: effectiveIsRequired,
            },
            resolvedRepositoryId,
            options.pullRequestId,
            resolvedId,
            resolvedProjectId,
          );

          if (!updatedReviewer) {
            throw new AzureDevOpsResourceNotFoundError(
              `Pull request ${options.pullRequestId} or reviewer '${resolvedId}' not found in repository '${resolvedRepositoryId}'`,
            );
          }

          results.push({
            input: entry.input,
            id: resolvedId,
            status: 'succeeded',
            reviewer: updatedReviewer,
          });
        } else {
          await deletePullRequestReviewerStrict(
            gitApi,
            resolvedRepositoryId,
            options.pullRequestId,
            resolvedId,
            resolvedProjectId,
          );

          results.push({
            input: entry.input,
            id: resolvedId,
            status: 'succeeded',
          });
        }
      } catch (err) {
        const mapped = mapReviewerError(
          err,
          `Failed to ${options.action} reviewer '${entry.input}' on pull request ${options.pullRequestId}`,
        );
        rawErrors.push(mapped);
        results.push({
          input: entry.input,
          ...(resolvedId ? { id: resolvedId } : {}),
          status: 'failed',
          error: mapped.message,
        });
      }
    }

    const succeeded = results.filter((r) => r.status === 'succeeded');
    const failed = results.filter((r) => r.status === 'failed');

    if (succeeded.length === 0 && failed.length > 0) {
      if (rawErrors.length === 1) {
        throw rawErrors[0];
      }
      const summary = failed
        .map((item) => `${item.input}: ${item.error ?? 'unknown error'}`)
        .join('; ');
      throw new AzureDevOpsError(
        `Failed to ${options.action} reviewers on pull request ${options.pullRequestId}: ${summary}`,
      );
    }

    return {
      action: options.action,
      pullRequestId: options.pullRequestId,
      repositoryId: resolvedRepositoryId,
      results,
      succeeded,
      failed,
      hasErrors: failed.length > 0,
    };
  } catch (error) {
    throw mapReviewerError(
      error,
      `Failed to manage reviewers (${options.action}) on pull request ${options.pullRequestId}`,
    );
  }
}

import type {
  GitPullRequest,
  IdentityRefWithVote,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { transformPullRequestStatus } from '../../../shared/enums/index.ts';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import {
  resolveCurrentUserId,
  resolveIdentityId,
} from '../../../shared/session/identity-resolver.ts';
import type {
  PullRequestNumericVote,
  PullRequestVoteInput,
  PullRequestVoteString,
  VotePullRequestOptions,
  VotePullRequestResponse,
} from '../types.ts';

/**
 * Normalize a pull request vote input (numeric or friendly string) to an exact
 * Azure DevOps numeric vote value (`10 | 5 | 0 | -5 | -10`).
 */
export function normalizePullRequestVote(
  vote: PullRequestVoteInput | number | string,
): PullRequestNumericVote {
  switch (vote) {
    case 10:
    case 'approved':
      return 10;
    case 5:
    case 'approvedWithSuggestions':
      return 5;
    case 0:
    case 'noVote':
      return 0;
    case -5:
    case 'waitingForAuthor':
      return -5;
    case -10:
    case 'rejected':
      return -10;
    default:
      throw new AzureDevOpsValidationError(
        `Invalid vote value '${String(vote)}'. Allowed values are 10/'approved', 5/'approvedWithSuggestions', 0/'noVote', -5/'waitingForAuthor', -10/'rejected'.`,
      );
  }
}

/**
 * Map a numeric Azure DevOps vote value back to its friendly label.
 */
export function getPullRequestVoteLabel(vote?: number): PullRequestVoteString {
  switch (vote) {
    case 10:
      return 'approved';
    case 5:
      return 'approvedWithSuggestions';
    case -5:
      return 'waitingForAuthor';
    case -10:
      return 'rejected';
    case 0:
    default:
      return 'noVote';
  }
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

function assertPullRequestActive(
  pr: GitPullRequest,
  pullRequestId: number,
): void {
  if (pr.status !== undefined && pr.status !== PullRequestStatus.Active) {
    const statusLabel = transformPullRequestStatus(pr.status);
    throw new AzureDevOpsValidationError(
      `Cannot cast vote on pull request ${pullRequestId}: pull request is ${statusLabel} (not active)`,
    );
  }
}

/**
 * Cast or reset a reviewer vote on an Azure DevOps pull request.
 * Auto-derives repositoryId from pullRequestId when omitted, defaults reviewerId
 * to the authenticated caller, and preserves existing `isRequired` unless explicitly overridden.
 */
export async function votePullRequest(
  ctx: ToolContext,
  options: VotePullRequestOptions,
): Promise<VotePullRequestResponse> {
  try {
    const numericVote = normalizePullRequestVote(options.vote);

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
      assertPullRequestActive(pr, options.pullRequestId);
      resolvedRepositoryId = pr.repository?.id;
      resolvedProjectId = projectId ?? pr.repository?.project?.id;
      if (!resolvedRepositoryId) {
        throw new AzureDevOpsValidationError(
          `Unable to determine repositoryId for pull request ${options.pullRequestId}`,
        );
      }
    }

    const resolvedIdentity = options.reviewerId
      ? await resolveIdentityId(ctx, options.reviewerId, options.organizationId)
      : await resolveCurrentUserId(ctx, options.organizationId);
    const reviewerGuid = resolvedIdentity.id;

    // Safeguard: preserve existing isRequired unless the caller explicitly overrides it.
    let effectiveIsRequired = options.isRequired;
    if (effectiveIsRequired === undefined) {
      let existingReviewer: IdentityRefWithVote | null | undefined;
      try {
        existingReviewer = await gitApi.getPullRequestReviewer(
          resolvedRepositoryId,
          options.pullRequestId,
          reviewerGuid,
          resolvedProjectId,
        );
      } catch (lookupError) {
        if (extractStatusCode(lookupError) !== 404) {
          throw lookupError;
        }
        existingReviewer = undefined;
      }

      if (existingReviewer && existingReviewer.isRequired !== undefined) {
        effectiveIsRequired = Boolean(existingReviewer.isRequired);
      }
    }

    const reviewerBody: IdentityRefWithVote = {
      id: reviewerGuid,
      vote: numericVote,
      ...(effectiveIsRequired !== undefined
        ? { isRequired: effectiveIsRequired }
        : {}),
      ...(options.isReapprove !== undefined
        ? { isReapprove: options.isReapprove }
        : {}),
      ...(options.hasDeclined !== undefined
        ? { hasDeclined: options.hasDeclined }
        : {}),
    };

    const updated = await gitApi.createPullRequestReviewer(
      reviewerBody,
      resolvedRepositoryId,
      options.pullRequestId,
      reviewerGuid,
      resolvedProjectId,
    );

    if (!updated) {
      throw new AzureDevOpsResourceNotFoundError(
        `Pull request ${options.pullRequestId} in repository '${resolvedRepositoryId}' was not found`,
      );
    }

    return {
      ...updated,
      pullRequestId: options.pullRequestId,
      repositoryId: resolvedRepositoryId,
      voteLabel: getPullRequestVoteLabel(updated.vote ?? numericVote),
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
          `Failed to cast vote on pull request ${options.pullRequestId}: ${message}`,
          { statusCode, message },
          { cause: error },
        );
      case 401:
        throw new AzureDevOpsAuthenticationError(
          `Authentication failed while voting on pull request ${options.pullRequestId}: ${message}`,
          { cause: error },
        );
      case 403:
        throw new AzureDevOpsPermissionError(
          `Permission denied while voting on pull request ${options.pullRequestId}: ${message}. Verify your PAT has Code Read & Write permissions (vso.code_write).`,
          { cause: error },
        );
      case 404:
        throw new AzureDevOpsResourceNotFoundError(
          `Pull request ${options.pullRequestId} or repository not found: ${message}`,
          { cause: error },
        );
      default:
        throw new AzureDevOpsError(
          `Failed to cast vote on pull request ${options.pullRequestId}: ${message}`,
          { cause: error },
        );
    }
  }
}

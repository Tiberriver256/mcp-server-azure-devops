import { WebApi } from 'azure-devops-node-api';
import {
  GitPullRequest,
  GitPullRequestCompletionOptions,
  GitPullRequestMergeStrategy,
  PullRequestAsyncStatus,
  PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  pullRequestMergeStrategyMapper,
  transformPullRequestStatus,
} from '../../../shared/enums';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import { MergePullRequestOptions, PullRequest } from '../types';

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

const MERGE_STATUS_LABELS: Record<number, string> = {
  [PullRequestAsyncStatus.NotSet]: 'notSet',
  [PullRequestAsyncStatus.Queued]: 'queued',
  [PullRequestAsyncStatus.Conflicts]: 'conflicts',
  [PullRequestAsyncStatus.Succeeded]: 'succeeded',
  [PullRequestAsyncStatus.RejectedByPolicy]: 'rejectedByPolicy',
  [PullRequestAsyncStatus.Failure]: 'failure',
};

function formatMergeStatus(status?: PullRequestAsyncStatus): string {
  if (status === undefined) {
    return 'unknown';
  }
  return MERGE_STATUS_LABELS[status] ?? String(status);
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

function buildCompletionOptions(
  options: MergePullRequestOptions,
): GitPullRequestCompletionOptions {
  const completionOptions: GitPullRequestCompletionOptions = {};

  if (options.mergeStrategy !== undefined) {
    const mappedStrategy = pullRequestMergeStrategyMapper.toEnum(
      options.mergeStrategy,
    );
    if (mappedStrategy === undefined) {
      throw new AzureDevOpsValidationError(
        `Invalid merge strategy: ${options.mergeStrategy}`,
      );
    }
    completionOptions.mergeStrategy =
      mappedStrategy as GitPullRequestMergeStrategy;
  }

  if (options.deleteSourceBranch !== undefined) {
    completionOptions.deleteSourceBranch = options.deleteSourceBranch;
  }

  if (options.transitionWorkItems !== undefined) {
    completionOptions.transitionWorkItems = options.transitionWorkItems;
  }

  if (options.mergeCommitMessage !== undefined) {
    completionOptions.mergeCommitMessage = options.mergeCommitMessage;
  }

  if (options.bypassPolicy !== undefined) {
    completionOptions.bypassPolicy = options.bypassPolicy;
  }

  if (options.bypassReason !== undefined) {
    completionOptions.bypassReason = options.bypassReason;
  }

  if (options.autoCompleteIgnoreConfigIds !== undefined) {
    completionOptions.autoCompleteIgnoreConfigIds =
      options.autoCompleteIgnoreConfigIds;
  }

  return completionOptions;
}

/**
 * Merge (complete) a pull request immediately, or enable/cancel auto-complete.
 * Works on both Azure DevOps Services (cloud) and Azure DevOps Server (on-prem).
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options controlling PR completion or auto-complete behavior
 * @returns The updated pull request
 */
export async function mergePullRequest(
  connection: WebApi,
  options: MergePullRequestOptions,
): Promise<PullRequest> {
  try {
    if (options.bypassReason !== undefined && options.bypassPolicy !== true) {
      throw new AzureDevOpsValidationError(
        'bypassReason requires bypassPolicy to be true',
      );
    }
    if (options.autoComplete === false && options.bypassPolicy === true) {
      throw new AzureDevOpsValidationError(
        'bypassPolicy cannot be used when canceling auto-complete',
      );
    }
    if (
      options.autoCompleteIgnoreConfigIds !== undefined &&
      options.autoComplete !== true
    ) {
      throw new AzureDevOpsValidationError(
        'autoCompleteIgnoreConfigIds requires autoComplete to be true',
      );
    }

    const gitApi = await connection.getGitApi();
    const project = options.projectId || undefined;

    const pr = options.repositoryId
      ? await gitApi.getPullRequest(
          options.repositoryId,
          options.pullRequestId,
          project,
        )
      : await gitApi.getPullRequestById(options.pullRequestId, project);

    if (!pr) {
      throw new AzureDevOpsResourceNotFoundError(
        `Pull request ${options.pullRequestId} not found`,
      );
    }

    const resolvedRepositoryId = options.repositoryId || pr.repository?.id;
    const resolvedProject = project || pr.repository?.project?.id;
    if (!resolvedRepositoryId) {
      throw new AzureDevOpsValidationError(
        `Unable to determine repositoryId for pull request ${options.pullRequestId}`,
      );
    }

    if (pr.status !== PullRequestStatus.Active) {
      const currentStatus =
        pr.status !== undefined
          ? transformPullRequestStatus(pr.status)
          : 'unknown';
      throw new AzureDevOpsValidationError(
        `Pull request ${options.pullRequestId} is not active (current status: ${currentStatus})`,
      );
    }

    let patch: GitPullRequest;

    if (options.autoComplete === false) {
      patch = {
        autoCompleteSetBy: { id: EMPTY_GUID },
      };
    } else if (options.autoComplete === true) {
      const completionOptions = buildCompletionOptions(options);
      const hasCompletionOptions = Object.keys(completionOptions).length > 0;

      const connData = await connection.connect();
      const userId = connData?.authenticatedUser?.id;
      if (!userId) {
        throw new AzureDevOpsAuthenticationError(
          'Unable to determine authenticated user ID for auto-complete',
        );
      }

      patch = {
        autoCompleteSetBy: { id: userId },
        ...(hasCompletionOptions ? { completionOptions } : {}),
      };
    } else {
      if (pr.isDraft) {
        throw new AzureDevOpsValidationError(
          `Cannot merge draft pull request ${options.pullRequestId}. Publish it first before completing.`,
        );
      }

      if (pr.mergeStatus === PullRequestAsyncStatus.Conflicts) {
        const details = pr.mergeFailureMessage
          ? `: ${pr.mergeFailureMessage}`
          : '';
        throw new AzureDevOpsValidationError(
          `Cannot merge pull request ${options.pullRequestId} due to merge conflicts${details}`,
        );
      }

      const prSourceCommitId = pr.lastMergeSourceCommit?.commitId;
      if (
        options.lastMergeSourceCommitId !== undefined &&
        prSourceCommitId !== undefined &&
        options.lastMergeSourceCommitId !== prSourceCommitId
      ) {
        throw new AzureDevOpsValidationError(
          `Stale lastMergeSourceCommitId for pull request ${options.pullRequestId}: expected ${options.lastMergeSourceCommitId}, but current source commit is ${prSourceCommitId}`,
        );
      }

      const sourceCommitId =
        options.lastMergeSourceCommitId ?? prSourceCommitId;
      if (!sourceCommitId) {
        const statusText = formatMergeStatus(pr.mergeStatus);
        const failureDetails = pr.mergeFailureMessage
          ? ` (${pr.mergeFailureMessage})`
          : '';
        throw new AzureDevOpsValidationError(
          `Pull request ${options.pullRequestId} has no lastMergeSourceCommit (mergeStatus: ${statusText})${failureDetails}`,
        );
      }

      const completionOptions = buildCompletionOptions(options);
      const hasCompletionOptions = Object.keys(completionOptions).length > 0;

      patch = {
        status: PullRequestStatus.Completed,
        lastMergeSourceCommit: { commitId: sourceCommitId },
        ...(hasCompletionOptions ? { completionOptions } : {}),
      };
    }

    const updatedPr = await gitApi.updatePullRequest(
      patch,
      resolvedRepositoryId,
      options.pullRequestId,
      resolvedProject,
    );

    if (!updatedPr) {
      throw new AzureDevOpsError(
        `Failed to merge pull request ${options.pullRequestId}: empty response from Azure DevOps`,
      );
    }

    return updatedPr;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    const statusCode = extractStatusCode(error);
    const message = error instanceof Error ? error.message : String(error);

    switch (statusCode) {
      case 401:
        throw new AzureDevOpsAuthenticationError(
          `Authentication failed while merging pull request ${options.pullRequestId}: ${message}`,
          { cause: error },
        );
      case 403:
        throw new AzureDevOpsPermissionError(
          `Permission denied while merging pull request ${options.pullRequestId}: ${message}`,
          { cause: error },
        );
      case 404:
        throw new AzureDevOpsResourceNotFoundError(
          `Pull request ${options.pullRequestId} or repository not found: ${message}`,
          { cause: error },
        );
      case 400:
      case 409:
        throw new AzureDevOpsValidationError(
          `Pull request ${options.pullRequestId} merge rejected: ${message}`,
          { statusCode, message },
          { cause: error },
        );
      default:
        throw new AzureDevOpsError(
          `Failed to merge pull request ${options.pullRequestId}: ${message}`,
          { cause: error },
        );
    }
  }
}

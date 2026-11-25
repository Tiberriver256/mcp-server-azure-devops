import type { WebApi } from 'azure-devops-node-api';
import type { GitPullRequestIterationChanges } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import type { PolicyEvaluationRecord } from 'azure-devops-node-api/interfaces/PolicyInterfaces.js';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';
import { buildGitChangesDiffs } from '../../../shared/utils/git-diff.ts';

export interface PullRequestChangesOptions {
  projectId: string;
  repositoryId: string;
  pullRequestId: number;
}

export interface PullRequestChangesResponse {
  changes: GitPullRequestIterationChanges;
  evaluations: PolicyEvaluationRecord[];
  files: Array<{ path: string; patch: string }>;
  sourceRefName?: string;
  targetRefName?: string;
}

/**
 * Retrieve changes and policy evaluation status for a pull request with
 * bounded concurrency, size caps, and binary guards.
 */
export async function getPullRequestChanges(
  connection: WebApi,
  options: PullRequestChangesOptions,
): Promise<PullRequestChangesResponse> {
  try {
    const gitApi = await connection.getGitApi();
    const [pullRequest, iterations] = await Promise.all([
      gitApi.getPullRequest(
        options.repositoryId,
        options.pullRequestId,
        options.projectId,
      ),
      gitApi.getPullRequestIterations(
        options.repositoryId,
        options.pullRequestId,
        options.projectId,
      ),
    ]);
    if (!iterations || iterations.length === 0) {
      throw new AzureDevOpsError('No iterations found for pull request');
    }
    const latest = iterations[iterations.length - 1];
    if (latest.id === undefined) {
      throw new AzureDevOpsError(
        'Latest pull request iteration is missing an ID',
      );
    }

    const [changes, policyApi] = await Promise.all([
      gitApi.getPullRequestIterationChanges(
        options.repositoryId,
        options.pullRequestId,
        latest.id,
        options.projectId,
      ),
      connection.getPolicyApi(),
    ]);

    // Policy evaluations require the project GUID in vstfs:///CodeReview/CodeReviewId/{projectGuid}/{prId}
    const projectGuid =
      pullRequest?.repository?.project?.id ?? options.projectId;
    const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectGuid}/${options.pullRequestId}`;
    const evaluations = await policyApi.getPolicyEvaluations(
      options.projectId,
      artifactId,
    );

    const changeEntries = changes.changeEntries ?? [];
    const files = await buildGitChangesDiffs(
      gitApi,
      options.repositoryId,
      options.projectId,
      changeEntries,
    );

    return {
      changes,
      evaluations,
      files,
      sourceRefName: pullRequest?.sourceRefName,
      targetRefName: pullRequest?.targetRefName,
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get pull request changes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

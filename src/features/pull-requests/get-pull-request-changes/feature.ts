import type { WebApi } from 'azure-devops-node-api';
import type {
  GitPullRequestIterationChanges,
  GitChange,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import type { PolicyEvaluationRecord } from 'azure-devops-node-api/interfaces/PolicyInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import { mapWithConcurrency } from '../../../shared/utils/concurrency';
import {
  isLikelyBinaryBuffer,
  streamToBuffer,
} from '../../../shared/utils/stream';
import { createTwoFilesPatch } from 'diff';

const MAX_DIFF_BLOB_BYTES = 2 * 1024 * 1024; // 2 MiB cap per blob
const BLOB_FETCH_CONCURRENCY = 6;

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

    const artifactId = `vstfs:///CodeReview/CodeReviewId/${options.projectId}/${options.pullRequestId}`;
    const evaluations = await policyApi.getPolicyEvaluations(
      options.projectId,
      artifactId,
    );

    const changeEntries = changes.changeEntries ?? [];

    const getBlobInfo = async (
      objId?: string,
    ): Promise<{ text: string; skippedReason?: string }> => {
      if (!objId) {
        return { text: '' };
      }
      const stream = await gitApi.getBlobContent(
        options.repositoryId,
        objId,
        options.projectId,
      );
      if (!stream) {
        return { text: '' };
      }
      try {
        const buf = await streamToBuffer(stream, MAX_DIFF_BLOB_BYTES);
        if (isLikelyBinaryBuffer(buf)) {
          return { text: '', skippedReason: 'binary file' };
        }
        return { text: buf.toString('utf8') };
      } catch {
        return {
          text: '',
          skippedReason: `file exceeds ${MAX_DIFF_BLOB_BYTES} byte diff limit`,
        };
      }
    };

    const files = await mapWithConcurrency(
      changeEntries,
      BLOB_FETCH_CONCURRENCY,
      async (entry: GitChange) => {
        const filePath = entry.item?.path || entry.originalPath || '';
        const [oldBlob, newBlob] = await Promise.all([
          getBlobInfo(entry.item?.originalObjectId),
          getBlobInfo(entry.item?.objectId),
        ]);
        const skipReason = oldBlob.skippedReason ?? newBlob.skippedReason;
        const patch = skipReason
          ? `[Diff omitted: ${skipReason}]`
          : createTwoFilesPatch(
              entry.originalPath || filePath,
              filePath,
              oldBlob.text,
              newBlob.text,
            );
        return { path: filePath, patch };
      },
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

import type { WebApi } from 'azure-devops-node-api';
import type { GitChange } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { createTwoFilesPatch } from 'diff';
import { AzureDevOpsError } from '../../../shared/errors';
import { mapWithConcurrency } from '../../../shared/utils/concurrency';
import {
  isLikelyBinaryBuffer,
  streamToBuffer,
} from '../../../shared/utils/stream';
import type {
  CommitWithContent,
  ListCommitsOptions,
  ListCommitsResponse,
} from '../types';

const MAX_DIFF_BLOB_BYTES = 2 * 1024 * 1024; // 2 MiB cap per blob when computing diffs
const BLOB_FETCH_CONCURRENCY = 6;

/**
 * List commits on a branch including their file-level diffs with bounded
 * concurrency, blob size limits, and binary file guards.
 */
export async function listCommits(
  connection: WebApi,
  options: ListCommitsOptions,
): Promise<ListCommitsResponse> {
  try {
    const gitApi = await connection.getGitApi();
    const commits = await gitApi.getCommits(
      options.repositoryId,
      {
        itemVersion: {
          version: options.branchName,
          versionType: GitVersionType.Branch,
        },
        $top: options.top ?? 10,
        $skip: options.skip,
      },
      options.projectId,
    );

    if (!commits || commits.length === 0) {
      return { commits: [] };
    }

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

    const commitsWithContent: CommitWithContent[] = [];

    for (const commit of commits) {
      const commitId = commit.commitId;
      if (!commitId) {
        continue;
      }

      const commitChanges = await gitApi.getChanges(
        commitId,
        options.repositoryId,
        options.projectId,
      );
      const changeEntries = commitChanges?.changes ?? [];

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

      commitsWithContent.push({
        commitId,
        comment: commit.comment,
        author: commit.author,
        committer: commit.committer,
        url: commit.url,
        parents: commit.parents,
        files,
      });
    }

    return { commits: commitsWithContent };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to list commits: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

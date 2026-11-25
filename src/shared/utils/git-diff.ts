import type { IGitApi } from 'azure-devops-node-api/GitApi.js';
import type { GitChange } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { createTwoFilesPatch } from 'diff';
import { mapWithConcurrency } from './concurrency.ts';
import {
  isLikelyBinaryBuffer,
  StreamSizeLimitError,
  streamToBuffer,
} from './stream.ts';

export const MAX_DIFF_BLOB_BYTES = 2 * 1024 * 1024; // 2 MiB cap per blob
export const BLOB_FETCH_CONCURRENCY = 6;

export interface GitFileDiff {
  path: string;
  patch: string;
}

type BlobContentReader = Pick<IGitApi, 'getBlobContent'>;

async function readDiffBlob(
  gitApi: BlobContentReader,
  repositoryId: string,
  projectId: string,
  objectId?: string,
  maxBytes: number = MAX_DIFF_BLOB_BYTES,
): Promise<{ text: string; skippedReason?: string }> {
  if (!objectId) {
    return { text: '' };
  }

  const stream = await gitApi.getBlobContent(repositoryId, objectId, projectId);
  if (!stream) {
    return { text: '' };
  }

  try {
    const buf = await streamToBuffer(stream, maxBytes);
    if (isLikelyBinaryBuffer(buf)) {
      return { text: '', skippedReason: 'binary file' };
    }
    return { text: buf.toString('utf8') };
  } catch (error) {
    if (error instanceof StreamSizeLimitError) {
      return {
        text: '',
        skippedReason: `file exceeds ${maxBytes} byte diff limit`,
      };
    }
    throw error;
  }
}

/**
 * Compute unified diffs for a set of Azure DevOps Git change entries using
 * bounded concurrency, per-blob size caps, and binary file guards.
 * Only StreamSizeLimitError is converted to an omission placeholder; real
 * network/stream/auth errors propagate to the caller.
 */
export async function buildGitChangesDiffs(
  gitApi: BlobContentReader,
  repositoryId: string,
  projectId: string,
  changeEntries: readonly GitChange[],
  options?: {
    maxBlobBytes?: number;
    concurrency?: number;
  },
): Promise<GitFileDiff[]> {
  const maxBytes = options?.maxBlobBytes ?? MAX_DIFF_BLOB_BYTES;
  const concurrency = options?.concurrency ?? BLOB_FETCH_CONCURRENCY;

  return await mapWithConcurrency(
    changeEntries,
    concurrency,
    async (entry: GitChange): Promise<GitFileDiff> => {
      const filePath = entry.item?.path || entry.originalPath || '';
      const [oldBlob, newBlob] = await Promise.all([
        readDiffBlob(
          gitApi,
          repositoryId,
          projectId,
          entry.item?.originalObjectId,
          maxBytes,
        ),
        readDiffBlob(
          gitApi,
          repositoryId,
          projectId,
          entry.item?.objectId,
          maxBytes,
        ),
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
}

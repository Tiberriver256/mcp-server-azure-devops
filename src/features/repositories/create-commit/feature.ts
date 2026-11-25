import type { WebApi } from 'azure-devops-node-api';
import type {
  GitRefUpdate,
  GitChange,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  GitVersionType,
  VersionControlChangeType,
  ItemContentType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { applyPatch, parsePatch } from 'diff';
import { AzureDevOpsError } from '../../../shared/errors';
import { streamToString } from '../../../shared/utils/stream';
import type { CreateCommitOptions } from '../types';

/**
 * Strip a single leading git diff `a/` or `b/` prefix without mangling
 * nested paths such as `a/b/foo.ts`.
 */
export function normalizeGitDiffPath(
  filePath?: string | null,
): string | undefined {
  if (!filePath || filePath === '/dev/null') {
    return undefined;
  }
  if (filePath.startsWith('a/') || filePath.startsWith('b/')) {
    return filePath.slice(2);
  }
  return filePath;
}

/**
 * Perform a literal first-occurrence search/replace without interpreting
 * special String.prototype.replace substitution patterns (`$&`, `$$`, `$'`, `` $` ``).
 */
export function applyLiteralSearchReplace(
  content: string,
  search: string,
  replace: string,
  filePath: string,
): string {
  const index = content.indexOf(search);
  if (index === -1) {
    throw new AzureDevOpsError(
      `Search string not found in ${filePath}. The file may have been modified since you last read it.`,
    );
  }
  return (
    content.slice(0, index) + replace + content.slice(index + search.length)
  );
}

/**
 * Create a commit with multiple file changes.
 */
export async function createCommit(
  connection: WebApi,
  options: CreateCommitOptions,
): Promise<void> {
  try {
    const gitApi = await connection.getGitApi();
    const branch = await gitApi.getBranch(
      options.repositoryId,
      options.branchName,
      options.projectId,
    );
    const baseCommit = branch?.commit?.commitId;
    if (!baseCommit) {
      throw new AzureDevOpsError(`Branch '${options.branchName}' not found`);
    }

    const changes: GitChange[] = [];

    for (const file of options.changes) {
      // Fast path for search/replace mode: single fetch + literal replacement (no double-fetch or diff round-trip)
      if (
        !file.patch &&
        file.search !== undefined &&
        file.replace !== undefined
      ) {
        if (!file.path) {
          throw new AzureDevOpsError(
            'path is required when using search/replace format',
          );
        }

        let currentContent = '';
        let fileExists = true;
        try {
          const stream = await gitApi.getItemContent(
            options.repositoryId,
            file.path,
            options.projectId,
            undefined,
            undefined,
            undefined,
            undefined,
            false,
            { version: options.branchName, versionType: GitVersionType.Branch },
            true,
          );
          currentContent = stream ? await streamToString(stream) : '';
        } catch {
          fileExists = false;
          currentContent = '';
        }

        const newContent = applyLiteralSearchReplace(
          currentContent,
          file.search,
          file.replace,
          file.path,
        );

        changes.push({
          changeType: fileExists
            ? VersionControlChangeType.Edit
            : VersionControlChangeType.Add,
          item: { path: file.path },
          newContent: {
            content: newContent,
            contentType: ItemContentType.RawText,
          },
        });
        continue;
      }

      if (!file.patch) {
        throw new AzureDevOpsError(
          'Either patch or both search and replace must be provided for each change',
        );
      }

      const patches = parsePatch(file.patch);
      if (patches.length !== 1) {
        throw new AzureDevOpsError(
          `Expected a single file diff for change but received ${patches.length}`,
        );
      }

      const patch = patches[0];
      const oldPath = normalizeGitDiffPath(patch.oldFileName);
      const newPath = normalizeGitDiffPath(patch.newFileName);
      const targetPath = file.path ?? newPath ?? oldPath;

      if (!targetPath) {
        throw new AzureDevOpsError(
          'Unable to determine target path for change',
        );
      }

      if (oldPath && newPath && oldPath !== newPath) {
        throw new AzureDevOpsError(
          `Renaming files is not supported (attempted ${oldPath} -> ${newPath})`,
        );
      }

      let originalContent = '';

      if (oldPath) {
        const stream = await gitApi.getItemContent(
          options.repositoryId,
          oldPath,
          options.projectId,
          undefined,
          undefined,
          undefined,
          undefined,
          false,
          { version: options.branchName, versionType: GitVersionType.Branch },
          true,
        );
        originalContent = stream ? await streamToString(stream) : '';
      }

      const patchedContent = applyPatch(originalContent, patch);

      if (patchedContent === false) {
        throw new AzureDevOpsError(
          `Failed to apply diff for ${targetPath}. Please ensure the patch is up to date with the branch head.`,
        );
      }

      if (!newPath) {
        changes.push({
          changeType: VersionControlChangeType.Delete,
          item: { path: targetPath },
        });
        continue;
      }

      const changeType = oldPath
        ? VersionControlChangeType.Edit
        : VersionControlChangeType.Add;

      changes.push({
        changeType,
        item: { path: targetPath },
        newContent: {
          content: patchedContent,
          contentType: ItemContentType.RawText,
        },
      });
    }

    const commit = {
      comment: options.commitMessage,
      changes,
    };

    const refUpdate: GitRefUpdate = {
      name: `refs/heads/${options.branchName}`,
      oldObjectId: baseCommit,
    };

    await gitApi.createPush(
      { commits: [commit], refUpdates: [refUpdate] },
      options.repositoryId,
      options.projectId,
    );
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to create commit: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

import { WebApi } from 'azure-devops-node-api';
import {
  GitVersionType,
  GitRefUpdate,
  GitChange,
  VersionControlChangeType,
  ItemContentType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { applyPatch, parsePatch, createTwoFilesPatch } from 'diff';
import { AzureDevOpsError } from '../../../shared/errors';
import { CreateCommitOptions } from '../types';

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  return await new Promise<string>((resolve, reject) => {
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Create a commit with multiple file changes
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
      // Handle search/replace format by generating a patch
      let patchString = file.patch;

      if (
        !patchString &&
        file.search !== undefined &&
        file.replace !== undefined
      ) {
        if (!file.path) {
          throw new AzureDevOpsError(
            'path is required when using search/replace format',
          );
        }

        // Fetch current file content
        let currentContent = '';
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
          // File might not exist (new file scenario) - treat as empty
          currentContent = '';
        }

        // Perform the replacement
        if (!currentContent.includes(file.search)) {
          throw new AzureDevOpsError(
            `Search string not found in ${file.path}. The file may have been modified since you last read it.`,
          );
        }

        const newContent = currentContent.replace(file.search, file.replace);

        // Generate proper unified diff
        patchString = createTwoFilesPatch(
          file.path,
          file.path,
          currentContent,
          newContent,
          undefined,
          undefined,
        );
      }

      if (!patchString) {
        throw new AzureDevOpsError(
          'Either patch or both search and replace must be provided for each change',
        );
      }

      const patches = parsePatch(patchString);
      if (patches.length !== 1) {
        throw new AzureDevOpsError(
          `Expected a single file diff for change but received ${patches.length}`,
        );
      }

      const patch = patches[0];

      const normalizePath = (path?: string | null): string | undefined => {
        if (!path || path === '/dev/null') {
          return undefined;
        }
        return path.replace(/^a\//, '').replace(/^b\//, '');
      };

      const oldPath = normalizePath(patch.oldFileName);
      const newPath = normalizePath(patch.newFileName);
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

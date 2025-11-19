import { WebApi } from 'azure-devops-node-api';
import {
  GitVersionType,
  VersionControlRecursionType,
  GitObjectType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import {
  GetRepositoryTreeOptions,
  RepositoryTreeItem,
  RepositoryTreeResponse,
} from '../types';

/**
 * Get tree view of files/directories in a repository starting at an optional path
 */
export async function getRepositoryTree(
  connection: WebApi,
  options: GetRepositoryTreeOptions,
): Promise<RepositoryTreeResponse> {
  try {
    const gitApi = await connection.getGitApi();

    const repository = await gitApi.getRepository(
      options.repositoryId,
      options.projectId,
    );
    if (!repository || !repository.id) {
      throw new AzureDevOpsError(
        `Repository '${options.repositoryId}' not found in project '${options.projectId}'`,
      );
    }

    const defaultBranch = repository.defaultBranch;
    if (!defaultBranch) {
      throw new AzureDevOpsError('Default branch not found');
    }
    const branchRef = defaultBranch.replace('refs/heads/', '');

    const rootPath = options.path ?? '/';
    const items = await gitApi.getItems(
      repository.id,
      options.projectId,
      rootPath,
      VersionControlRecursionType.Full,
      true,
      false,
      false,
      false,
      {
        version: branchRef,
        versionType: GitVersionType.Branch,
      },
    );

    const treeItems: RepositoryTreeItem[] = [];
    const stats = { directories: 0, files: 0 };

    for (const item of items) {
      const path = item.path || '';
      if (path === rootPath || item.gitObjectType === GitObjectType.Bad) {
        continue;
      }
      const relative =
        rootPath === '/'
          ? path.replace(/^\//, '')
          : path.slice(rootPath.length + 1);
      const level = relative.split('/').length;
      if (options.depth && options.depth > 0 && level > options.depth) {
        continue;
      }
      const isFolder = !!item.isFolder;
      treeItems.push({
        name: relative.split('/').pop() || '',
        path,
        isFolder,
        level,
      });
      if (isFolder) stats.directories++;
      else stats.files++;
    }

    return {
      name: repository.name || options.repositoryId,
      tree: treeItems,
      stats,
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get repository tree: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

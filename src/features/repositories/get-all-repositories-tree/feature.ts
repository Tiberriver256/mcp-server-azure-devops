import type { WebApi } from 'azure-devops-node-api';
import type { IGitApi } from 'azure-devops-node-api/GitApi.js';
import type { GitItem } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  GitVersionType,
  VersionControlRecursionType,
  GitObjectType,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';
import { logError } from '../../../shared/logging.ts';
import { mapWithConcurrency } from '../../../shared/utils/concurrency.ts';
import { compileGlobMatcher } from '../../../shared/utils/glob.ts';
import type {
  GetAllRepositoriesTreeOptions,
  AllRepositoriesTreeResponse,
  RepositoryTreeResponse,
  RepositoryTreeItem,
  GitRepository,
} from '../types.ts';

const FOLDER_TRAVERSAL_CONCURRENCY = 6;

/**
 * Get tree view of files/directories across multiple repositories.
 */
export async function getAllRepositoriesTree(
  connection: WebApi,
  options: GetAllRepositoriesTreeOptions,
): Promise<AllRepositoriesTreeResponse> {
  try {
    const gitApi = await connection.getGitApi();
    let repositories: GitRepository[] = await gitApi.getRepositories(
      options.projectId,
    );

    if (options.repositoryPattern) {
      const repoMatcher = compileGlobMatcher(options.repositoryPattern);
      repositories = repositories.filter((repo) =>
        repoMatcher(repo.name || ''),
      );
    }

    const fileMatcher = options.pattern
      ? compileGlobMatcher(options.pattern)
      : undefined;

    const results: RepositoryTreeResponse[] = [];

    for (const repo of repositories) {
      try {
        const defaultBranch = repo.defaultBranch;
        if (!defaultBranch) {
          results.push({
            name: repo.name || 'Unknown',
            tree: [],
            stats: { directories: 0, files: 0 },
            error: 'No default branch found',
          });
          continue;
        }

        const branchRef = defaultBranch.replace('refs/heads/', '');
        const treeItems: RepositoryTreeItem[] = [];
        const stats = { directories: 0, files: 0 };
        const depth = options.depth ?? 0;

        if (depth === 0) {
          const allItems = await gitApi.getItems(
            repo.id || '',
            options.projectId,
            '/',
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

          const itemsToProcess = allItems.filter(
            (item) =>
              item.path !== '/' && item.gitObjectType !== GitObjectType.Bad,
          );

          processItemsNonRecursive(
            itemsToProcess,
            treeItems,
            stats,
            fileMatcher,
          );
        } else {
          const rootItems = await gitApi.getItems(
            repo.id || '',
            options.projectId,
            '/',
            VersionControlRecursionType.OneLevel,
            true,
            false,
            false,
            false,
            {
              version: branchRef,
              versionType: GitVersionType.Branch,
            },
          );

          const itemsToProcess = rootItems.filter(
            (item) =>
              item.path !== '/' && item.gitObjectType !== GitObjectType.Bad,
          );

          await processItems(
            gitApi,
            repo.id || '',
            options.projectId,
            itemsToProcess,
            branchRef,
            treeItems,
            stats,
            1,
            depth,
            fileMatcher,
          );
        }

        results.push({
          name: repo.name || 'Unknown',
          tree: treeItems,
          stats,
        });
      } catch (repoError) {
        results.push({
          name: repo.name || 'Unknown',
          tree: [],
          stats: { directories: 0, files: 0 },
          error: `Error processing repository: ${repoError instanceof Error ? repoError.message : String(repoError)}`,
        });
      }
    }

    return { repositories: results };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get repository tree: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function compareGitItems(a: GitItem, b: GitItem): number {
  if (Boolean(a.isFolder) === Boolean(b.isFolder)) {
    return (a.path || '').localeCompare(b.path || '');
  }
  return a.isFolder ? -1 : 1;
}

/**
 * Process items non-recursively when already retrieved with VersionControlRecursionType.Full.
 */
function processItemsNonRecursive(
  items: GitItem[],
  result: RepositoryTreeItem[],
  stats: { directories: number; files: number },
  fileMatcher?: (name: string) => boolean,
): void {
  const sortedItems = [...items].sort(compareGitItems);

  for (const item of sortedItems) {
    const itemPath = item.path || '';
    if (itemPath === '/' || itemPath === '') {
      continue;
    }

    const lastSlash = itemPath.lastIndexOf('/');
    const name = lastSlash === -1 ? itemPath : itemPath.slice(lastSlash + 1);
    const isFolder = Boolean(item.isFolder);

    if (!isFolder && fileMatcher && !fileMatcher(name)) {
      continue;
    }

    let level = 1;
    const startIdx = itemPath.startsWith('/') ? 1 : 0;
    for (let i = startIdx; i < itemPath.length; i++) {
      if (itemPath.charCodeAt(i) === 47) {
        level += 1;
      }
    }

    result.push({
      name,
      path: itemPath,
      isFolder,
      level,
    });

    if (isFolder) {
      stats.directories += 1;
    } else {
      stats.files += 1;
    }
  }
}

/**
 * Process items recursively up to maxDepth using bounded concurrency for sibling folders.
 */
async function processItems(
  gitApi: IGitApi,
  repoId: string,
  projectId: string,
  items: GitItem[],
  branchRef: string,
  result: RepositoryTreeItem[],
  stats: { directories: number; files: number },
  currentDepth: number,
  maxDepth: number,
  fileMatcher?: (name: string) => boolean,
): Promise<void> {
  const sortedItems = [...items].sort(compareGitItems);
  const foldersToExpand: Array<{
    path: string;
    children: RepositoryTreeItem[];
  }> = [];

  for (const item of sortedItems) {
    const itemPath = item.path || '';
    const lastSlash = itemPath.lastIndexOf('/');
    const name = lastSlash === -1 ? itemPath : itemPath.slice(lastSlash + 1);
    const isFolder = Boolean(item.isFolder);

    if (!isFolder && fileMatcher && !fileMatcher(name)) {
      continue;
    }

    result.push({
      name,
      path: itemPath,
      isFolder,
      level: currentDepth,
    });

    if (isFolder) {
      stats.directories += 1;
      if (currentDepth < maxDepth) {
        foldersToExpand.push({ path: itemPath, children: [] });
      }
    } else {
      stats.files += 1;
    }
  }

  if (foldersToExpand.length === 0) {
    return;
  }

  await mapWithConcurrency(
    foldersToExpand,
    FOLDER_TRAVERSAL_CONCURRENCY,
    async (folder) => {
      try {
        const childItems = await gitApi.getItems(
          repoId,
          projectId,
          folder.path,
          VersionControlRecursionType.OneLevel,
          true,
          false,
          false,
          false,
          {
            version: branchRef,
            versionType: GitVersionType.Branch,
          },
        );

        const itemsToProcess = childItems.filter(
          (child: GitItem) =>
            child.path !== folder.path &&
            child.gitObjectType !== GitObjectType.Bad,
        );

        await processItems(
          gitApi,
          repoId,
          projectId,
          itemsToProcess,
          branchRef,
          folder.children,
          stats,
          currentDepth + 1,
          maxDepth,
          fileMatcher,
        );
      } catch (error) {
        logError(
          `Error processing folder ${folder.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  for (const folder of foldersToExpand) {
    for (const child of folder.children) {
      result.push(child);
    }
  }
}

/**
 * Convert tree items to a formatted ASCII string representation.
 */
export function formatRepositoryTree(
  repoName: string,
  items: RepositoryTreeItem[],
  stats: { directories: number; files: number },
  error?: string,
): string {
  const lines: string[] = [`${repoName}/`];

  if (error) {
    lines.push(`  (${error})`);
  } else if (items.length === 0) {
    lines.push('  (Repository is empty or default branch not found)');
  } else {
    const tree = createTreeStructure(items);
    appendFormattedTree(tree, '  ', lines);
  }

  lines.push(`${stats.directories} directories, ${stats.files} files`);
  return `${lines.join('\n')}\n`;
}

function createTreeStructure(items: RepositoryTreeItem[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    isFolder: true,
    children: [],
  };

  const nodeMap = new Map<string, TreeNode>([['', root]]);

  for (const item of items) {
    nodeMap.set(item.path, {
      name: item.name,
      path: item.path,
      isFolder: item.isFolder,
      children: [],
    });
  }

  for (const item of items) {
    if (item.path === '/') {
      continue;
    }

    const node = nodeMap.get(item.path);
    if (!node) {
      continue;
    }

    const lastSlashIndex = item.path.lastIndexOf('/');
    const parentPath =
      lastSlashIndex <= 0 ? '' : item.path.substring(0, lastSlashIndex);
    const parent = nodeMap.get(parentPath) ?? root;
    parent.children.push(node);
  }

  return root;
}

function appendFormattedTree(
  node: TreeNode,
  indent: string,
  lines: string[],
): void {
  if (node.children.length === 0) {
    return;
  }

  const children = [...node.children].sort((a, b) => {
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;
    const connector = isLast ? '`-- ' : '|-- ';
    const childIndent = isLast ? '    ' : '|   ';
    const suffix = child.isFolder ? '/' : '';

    lines.push(`${indent}${connector}${child.name}${suffix}`);

    if (child.children.length > 0) {
      appendFormattedTree(child, indent + childIndent, lines);
    }
  }
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
}

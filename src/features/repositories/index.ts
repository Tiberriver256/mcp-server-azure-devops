export * from './schemas.ts';
export * from './types.ts';
export { getRepository } from './get-repository/feature.ts';
export { getRepositoryDetails } from './get-repository-details/feature.ts';
export { listRepositories } from './list-repositories/feature.ts';
export { getFileContent } from './get-file-content/feature.ts';
export {
  getAllRepositoriesTree,
  formatRepositoryTree,
} from './get-all-repositories-tree/feature.ts';
export { getRepositoryTree } from './get-repository-tree/feature.ts';
export { createBranch } from './create-branch/feature.ts';
export {
  createCommit,
  applyLiteralSearchReplace,
  normalizeGitDiffPath,
} from './create-commit/feature.ts';
export { listCommits } from './list-commits/feature.ts';

import { defineTool } from '../../shared/registry/tool-registry.ts';
import type { FeatureModule } from '../../shared/registry/tool-registry.ts';
import { gitVersionTypeMapper } from '../../shared/enums/index.ts';
import {
  CreateBranchSchema,
  CreateCommitSchema,
  GetAllRepositoriesTreeSchema,
  GetFileContentSchema,
  GetRepositoryDetailsSchema,
  GetRepositorySchema,
  GetRepositoryTreeSchema,
  ListCommitsSchema,
  ListRepositoriesSchema,
} from './schemas.ts';
import { getRepository } from './get-repository/feature.ts';
import { getRepositoryDetails } from './get-repository-details/feature.ts';
import { listRepositories } from './list-repositories/feature.ts';
import { getFileContent } from './get-file-content/feature.ts';
import {
  getAllRepositoriesTree,
  formatRepositoryTree,
} from './get-all-repositories-tree/feature.ts';
import { getRepositoryTree } from './get-repository-tree/feature.ts';
import { createBranch } from './create-branch/feature.ts';
import { createCommit } from './create-commit/feature.ts';
import { listCommits } from './list-commits/feature.ts';

export const repositoriesFeature: FeatureModule = {
  toolset: 'repositories',
  tools: [
    defineTool({
      name: 'get_repository',
      description: 'Get details of a specific repository',
      schema: GetRepositorySchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await getRepository(
          connection,
          ctx.resolveProjectId(args.projectId),
          args.repositoryId,
        );
      },
    }),
    defineTool({
      name: 'get_repository_details',
      description:
        'Get detailed information about a repository including statistics and refs',
      schema: GetRepositoryDetailsSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await getRepositoryDetails(connection, {
          projectId: ctx.resolveProjectId(args.projectId),
          repositoryId: args.repositoryId,
          includeStatistics: args.includeStatistics,
          includeRefs: args.includeRefs,
          refFilter: args.refFilter,
          branchName: args.branchName,
        });
      },
    }),
    defineTool({
      name: 'list_repositories',
      description: 'List repositories in a project',
      schema: ListRepositoriesSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await listRepositories(connection, {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        });
      },
    }),
    defineTool({
      name: 'get_file_content',
      description: 'Get content of a file or directory from a repository',
      schema: GetFileContentSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        const versionTypeEnum =
          args.versionType && args.version
            ? gitVersionTypeMapper.toEnum(args.versionType)
            : undefined;

        return await getFileContent(
          connection,
          ctx.resolveProjectId(args.projectId),
          args.repositoryId,
          args.path,
          versionTypeEnum !== undefined && args.version
            ? { versionType: versionTypeEnum, version: args.version }
            : undefined,
        );
      },
    }),
    defineTool({
      name: 'get_all_repositories_tree',
      description:
        'Displays a hierarchical tree view of files and directories across multiple Azure DevOps repositories within a project, based on their default branches',
      schema: GetAllRepositoriesTreeSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        const result = await getAllRepositoriesTree(connection, {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
          organizationId:
            args.organizationId ??
            ctx.baseUrls.organization ??
            ctx.baseUrls.collection ??
            '',
        });

        const sections = result.repositories.map((repo) =>
          formatRepositoryTree(repo.name, repo.tree, repo.stats, repo.error),
        );
        return sections.length > 0 ? `${sections.join('\n')}\n` : '';
      },
    }),
    defineTool({
      name: 'get_repository_tree',
      description:
        'Displays a hierarchical tree view of files and directories within a single repository starting from an optional path',
      schema: GetRepositoryTreeSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await getRepositoryTree(connection, {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        });
      },
    }),
    defineTool({
      name: 'create_branch',
      description: 'Create a new branch from an existing one',
      schema: CreateBranchSchema,
      readOnly: false,
      destructive: false,
      idempotent: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        await createBranch(connection, {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        });
        return 'Branch created successfully';
      },
    }),
    defineTool({
      name: 'create_commit',
      description: [
        'Create a commit on an existing branch with one change entry per file path (pass plain branch names without "refs/heads/").',
        'Prefer search/replace (`path`, `search`, `replace`) for targeted edits; use unified git `patch` with numbered `@@ -old,len +new,len @@` hunks (and `/dev/null` headers) for file additions, deletions, or multi-hunk diffs.',
      ].join(' '),
      schema: CreateCommitSchema,
      readOnly: false,
      destructive: true,
      idempotent: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        await createCommit(connection, {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        });
        return 'Commit created successfully';
      },
    }),
    defineTool({
      name: 'list_commits',
      description:
        'List recent commits on a branch including file-level diff content for each commit',
      schema: ListCommitsSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await listCommits(connection, {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        });
      },
    }),
  ],
};

export * from './schemas';
export * from './types';
export { getRepository } from './get-repository/feature';
export { getRepositoryDetails } from './get-repository-details/feature';
export { listRepositories } from './list-repositories/feature';
export { getFileContent } from './get-file-content/feature';
export {
  getAllRepositoriesTree,
  formatRepositoryTree,
} from './get-all-repositories-tree/feature';
export { getRepositoryTree } from './get-repository-tree/feature';
export { createBranch } from './create-branch/feature';
export {
  createCommit,
  applyLiteralSearchReplace,
  normalizeGitDiffPath,
} from './create-commit/feature';
export { listCommits } from './list-commits/feature';

import { defineTool } from '../../shared/registry/tool-registry';
import type { FeatureModule } from '../../shared/registry/tool-registry';
import { gitVersionTypeMapper } from '../../shared/enums';
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
} from './schemas';
import { getRepository } from './get-repository/feature';
import { getRepositoryDetails } from './get-repository-details/feature';
import { listRepositories } from './list-repositories/feature';
import { getFileContent } from './get-file-content/feature';
import {
  getAllRepositoriesTree,
  formatRepositoryTree,
} from './get-all-repositories-tree/feature';
import { getRepositoryTree } from './get-repository-tree/feature';
import { createBranch } from './create-branch/feature';
import { createCommit } from './create-commit/feature';
import { listCommits } from './list-commits/feature';

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
        'Create a commit on an existing branch using file changes.',
        '- Provide plain branch names (no "refs/heads/").',
        '- ⚠️ Each file path may appear only once per commit request—combine all edits to a file into a single change entry.',
        '- Prefer multiple commits when you have sparse or unrelated edits; smaller focused commits keep review context clear.',
        '',
        '🎯 RECOMMENDED: Use the SEARCH/REPLACE format (much easier, no line counting!).',
        '',
        '**Option 1: SEARCH/REPLACE format (EASIEST)**',
        'Simply provide the exact text to find and replace:',
        '```json',
        '{',
        '  "changes": [{',
        '    "path": "src/api/services/function-call.ts",',
        '    "search": "return fetch(apiUrl, requestConfig);",',
        '    "replace": "return fetch(apiUrl, requestConfig).then(r => { processResponse(r); return r; });"',
        '  }]',
        '}',
        '```',
        'The server fetches the file and performs the exact replacement automatically.',
        'No line counting, no hunk headers, no context lines needed!',
        '',
        '**Option 2: UNIFIED DIFF format (Advanced)**',
        'If you prefer full control, provide complete unified diffs:',
        '- Each patch MUST have complete hunk headers: @@ -oldStart,oldLines +newStart,newLines @@',
        '- CRITICAL: Every @@ marker MUST include line numbers. Do NOT use @@ without line ranges.',
        '- Include 3-5 context lines before and after changes.',
        '- For deletions: `--- a/filepath` and `+++ /dev/null`',
        '- For additions: `--- /dev/null` and `+++ b/filepath`',
        '',
        'Example unified diff:',
        '```json',
        '{',
        '  "changes": [{',
        '    "patch": "diff --git a/file.yaml b/file.yaml\\n--- a/file.yaml\\n+++ b/file.yaml\\n@@ -4,7 +4,7 @@ spec:\\n spec:\\n   type: ClusterIP\\n   ports:\\n-    - port: 8080\\n+    - port: 9090\\n       targetPort: http\\n"',
        '  }]',
        '}',
        '```',
      ].join('\n'),
      schema: CreateCommitSchema,
      readOnly: false,
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

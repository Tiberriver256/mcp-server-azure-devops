import { z } from 'zod';

const defaultProjectDesc =
  'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)';
const defaultOrgDesc =
  'The ID or name of the organization (defaults to configured organization)';

/**
 * Schema for getting a repository
 */
export const GetRepositorySchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
});

/**
 * Schema for getting detailed repository information
 */
export const GetRepositoryDetailsSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
  includeStatistics: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to include branch statistics'),
  includeRefs: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to include repository refs'),
  refFilter: z
    .string()
    .optional()
    .describe('Optional filter for refs (e.g., "heads/" or "tags/")'),
  branchName: z
    .string()
    .optional()
    .describe(
      'Name of specific branch to get statistics for (if includeStatistics is true)',
    ),
});

/**
 * Schema for listing repositories
 */
export const ListRepositoriesSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  includeLinks: z
    .boolean()
    .optional()
    .describe('Whether to include reference links'),
});

/**
 * Schema for getting file content
 */
export const GetFileContentSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
  path: z
    .string()
    .optional()
    .default('/')
    .describe('Path to the file or folder'),
  version: z
    .string()
    .optional()
    .describe('The version (branch, tag, or commit) to get content from'),
  versionType: z
    .enum(['branch', 'commit', 'tag'])
    .optional()
    .describe('Type of version specified (branch, commit, or tag)'),
});

/**
 * Schema for getting all repositories tree structure
 */
export const GetAllRepositoriesTreeSchema = z.object({
  organizationId: z.string().optional().describe(defaultOrgDesc),
  projectId: z.string().optional().describe(defaultProjectDesc),
  repositoryPattern: z
    .string()
    .optional()
    .describe(
      'Repository name pattern (wildcard characters allowed) to filter which repositories are included',
    ),
  depth: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .default(0)
    .describe(
      'Maximum depth to traverse within each repository (0 = unlimited)',
    ),
  pattern: z
    .string()
    .optional()
    .describe(
      'File pattern (wildcard characters allowed) to filter files by within each repository',
    ),
});

/**
 * Schema for getting a tree for a single repository
 */
export const GetRepositoryTreeSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
  path: z
    .string()
    .optional()
    .default('/')
    .describe('Path within the repository to start from'),
  depth: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .default(0)
    .describe('Maximum depth to traverse (0 = unlimited)'),
});

/**
 * Schema for creating a new branch
 */
export const CreateBranchSchema = z
  .object({
    projectId: z.string().optional().describe(defaultProjectDesc),
    organizationId: z.string().optional().describe(defaultOrgDesc),
    repositoryId: z.string().describe('The ID or name of the repository'),
    sourceBranch: z
      .string()
      .describe(
        'Name of the branch to copy from (without "refs/heads/", e.g., "master")',
      ),
    newBranch: z
      .string()
      .describe(
        'Name of the new branch to create (without "refs/heads/", e.g., "feature/my-branch")',
      ),
  })
  .describe(
    'Create a new branch from an existing branch.\n' +
      '- Pass plain branch names (no "refs/heads/"). Example: sourceBranch="master", newBranch="codex/test1".\n' +
      '- When creating pull requests later, use fully-qualified refs (e.g., "refs/heads/codex/test1").',
  );

/**
 * Schema for creating a commit with multiple file changes
 */
export const CreateCommitSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
  branchName: z
    .string()
    .describe('Branch name to commit to (without "refs/heads/", e.g., "main")'),
  commitMessage: z.string().describe('Commit message'),
  changes: z
    .array(
      z
        .object({
          path: z
            .string()
            .optional()
            .describe(
              'File path (required for search/replace; optional for patch where the diff header specifies the path)',
            ),
          patch: z
            .string()
            .optional()
            .describe(
              'Unified git diff for a single file with `diff --git`, `---`/`+++` headers (`/dev/null` for add/delete), numbered `@@ -oldStart,oldLines +newStart,newLines @@` hunks, and 3-5 context lines',
            ),
          search: z
            .string()
            .optional()
            .describe(
              'Exact text to find in the file (must be paired with `replace` and `path`)',
            ),
          replace: z
            .string()
            .optional()
            .describe(
              'Exact replacement text for `search` (must be paired with `search` and `path`)',
            ),
        })
        .refine(
          (data) => {
            const hasPatch = !!data.patch;
            const hasSearchReplace = !!data.search && !!data.replace;
            return hasPatch || hasSearchReplace;
          },
          {
            message:
              'Either "patch" or both "search" and "replace" must be provided',
          },
        ),
    )
    .describe(
      'File changes as either search/replace entries or unified git diffs (one entry per file path)',
    ),
});

/**
 * Schema for listing commits on a branch
 */
export const ListCommitsSchema = z.object({
  projectId: z.string().optional().describe(defaultProjectDesc),
  organizationId: z.string().optional().describe(defaultOrgDesc),
  repositoryId: z.string().describe('The ID or name of the repository'),
  branchName: z.string().describe('Branch name to list commits from'),
  top: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum number of commits to return (Default: 10)'),
  skip: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Number of commits to skip from the newest'),
});

/**
 * Schema for listing branches in a repository
 */
export const ListBranchesSchema = z
  .object({
    projectId: z.string().optional().describe(defaultProjectDesc),
    organizationId: z.string().optional().describe(defaultOrgDesc),
    repositoryId: z
      .string()
      .trim()
      .min(1)
      .describe('The ID or name of the repository'),
    filter: z
      .string()
      .optional()
      .describe(
        'Optional branch name prefix filter (e.g., "feature/" or "heads/feature/"). Automatically scoped to heads/. Cannot be combined with includeMyBranches: true.',
      ),
    filterContains: z
      .string()
      .optional()
      .describe('Optional substring filter for branch names'),
    includeMyBranches: z
      .boolean()
      .optional()
      .describe(
        'Return only branches created by the authenticated caller. Cannot be combined with filter.',
      ),
    includeStatuses: z
      .boolean()
      .optional()
      .describe('Include Git commit statuses on each branch'),
    latestStatusesOnly: z
      .boolean()
      .optional()
      .describe(
        'Return only the latest status per context (requires includeStatuses: true)',
      ),
    includeStats: z
      .boolean()
      .optional()
      .describe(
        'Enrich branches with aheadCount, behindCount, isBaseVersion, and tip commit from stats/branches',
      ),
    top: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        'Maximum number of branches to return per page (1–1000; supported on Azure DevOps Services and Server 2020+)',
      ),
    continuationToken: z
      .string()
      .optional()
      .describe(
        'Continuation token from a previous list_branches response (supported on Azure DevOps Services and Server 2020+)',
      ),
  })
  .superRefine((data, ctx) => {
    if (
      data.includeMyBranches === true &&
      typeof data.filter === 'string' &&
      data.filter.trim().length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Cannot combine filter with includeMyBranches: true (mutually exclusive in Azure DevOps Git Refs API)',
        path: ['filter'],
      });
    }
    if (data.latestStatusesOnly === true && data.includeStatuses !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'latestStatusesOnly requires includeStatuses to be true',
        path: ['latestStatusesOnly'],
      });
    }
  });

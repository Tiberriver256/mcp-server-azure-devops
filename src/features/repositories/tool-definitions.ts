import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  GetRepositorySchema,
  GetRepositoryDetailsSchema,
  ListRepositoriesSchema,
  GetFileContentSchema,
  GetAllRepositoriesTreeSchema,
  GetRepositoryTreeSchema,
  CreateBranchSchema,
  CreateCommitSchema,
  ListCommitsSchema,
} from './schemas';

/**
 * List of repositories tools
 */
export const repositoriesTools: ToolDefinition[] = [
  {
    name: 'get_repository',
    description: 'Get details of a specific repository',
    inputSchema: zodToJsonSchema(GetRepositorySchema),
    readOnly: true,
  },
  {
    name: 'get_repository_details',
    description:
      'Get detailed information about a repository including statistics and refs',
    inputSchema: zodToJsonSchema(GetRepositoryDetailsSchema),
    readOnly: true,
  },
  {
    name: 'list_repositories',
    description: 'List repositories in a project',
    inputSchema: zodToJsonSchema(ListRepositoriesSchema),
    readOnly: true,
  },
  {
    name: 'get_file_content',
    description: 'Get content of a file or directory from a repository',
    inputSchema: zodToJsonSchema(GetFileContentSchema),
    readOnly: true,
  },
  {
    name: 'get_all_repositories_tree',
    description:
      'Displays a hierarchical tree view of files and directories across multiple Azure DevOps repositories within a project, based on their default branches',
    inputSchema: zodToJsonSchema(GetAllRepositoriesTreeSchema),
    readOnly: true,
  },
  {
    name: 'get_repository_tree',
    description:
      'Displays a hierarchical tree view of files and directories within a single repository starting from an optional path',
    inputSchema: zodToJsonSchema(GetRepositoryTreeSchema),
    readOnly: true,
  },
  {
    name: 'create_branch',
    description: 'Create a new branch from an existing one',
    inputSchema: zodToJsonSchema(CreateBranchSchema),
    readOnly: false,
  },
  {
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
      '    "search": "return axios.post(apiUrl, payload, requestConfig);",',
      '    "replace": "return axios.post(apiUrl, payload, requestConfig).then(r => { processResponse(r); return r; });"',
      '  }]',
      '}',
      '```',
      'The server fetches the file, performs the replacement, and generates the diff automatically.',
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
    inputSchema: zodToJsonSchema(CreateCommitSchema),
    readOnly: false,
  },
  {
    name: 'list_commits',
    description:
      'List recent commits on a branch including file-level diff content for each commit',
    inputSchema: zodToJsonSchema(ListCommitsSchema),
    readOnly: true,
  },
];

import { toJsonSchema } from '../../shared/utils/to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  CreatePullRequestSchema,
  GetPullRequestSchema,
  ListPullRequestsSchema,
  GetPullRequestCommentsSchema,
  AddPullRequestCommentSchema,
  UpdatePullRequestSchema,
  GetPullRequestChangesSchema,
  GetPullRequestChecksSchema,
  UpdatePullRequestThreadStatusSchema,
} from './schemas';

/**
 * List of pull requests tools
 */
export const pullRequestsTools: ToolDefinition[] = [
  {
    name: 'create_pull_request',
    description:
      'Create a new pull request, including reviewers, linked work items, and optional tags',
    inputSchema: toJsonSchema(CreatePullRequestSchema),
  },
  {
    name: 'get_pull_request',
    description:
      'Get a pull request by ID (no repositoryId required; best for Azure DevOps Server where PR IDs are project-scoped)',
    inputSchema: toJsonSchema(GetPullRequestSchema),
  },
  {
    name: 'list_pull_requests',
    description: 'List pull requests in a repository',
    inputSchema: toJsonSchema(ListPullRequestsSchema),
  },
  {
    name: 'get_pull_request_comments',
    description: 'Get comments from a specific pull request',
    inputSchema: toJsonSchema(GetPullRequestCommentsSchema),
  },
  {
    name: 'add_pull_request_comment',
    description:
      'Add a comment to a pull request (repositoryId optional; derived from pullRequestId when omitted)',
    inputSchema: toJsonSchema(AddPullRequestCommentSchema),
  },
  {
    name: 'update_pull_request',
    description:
      'Update an existing pull request with new properties, manage reviewers and work items, and add or remove tags',
    inputSchema: toJsonSchema(UpdatePullRequestSchema),
  },
  {
    name: 'get_pull_request_changes',
    description:
      'Get the files changed in a pull request, their unified diffs, source/target branch names, and the status of policy evaluations',
    inputSchema: toJsonSchema(GetPullRequestChangesSchema),
  },
  {
    name: 'get_pull_request_checks',
    description: [
      'Summarize the latest status checks and policy evaluations for a pull request.',
      '- Surfaces pipeline and run identifiers so you can jump straight to the blocking validation.',
      '- Pair with pipeline tools (e.g., get_pipeline_run, pipeline_timeline) to inspect failures in depth.',
    ].join('\n'),
    inputSchema: toJsonSchema(GetPullRequestChecksSchema),
  },
  {
    name: 'update_pull_request_thread_status',
    description:
      'Update the status of a comment thread in a pull request (repositoryId optional; derived from pullRequestId when omitted)',
    inputSchema: toJsonSchema(UpdatePullRequestThreadStatusSchema),
  },
];

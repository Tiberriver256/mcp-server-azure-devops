import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  CreatePullRequestSchema,
  ListPullRequestsSchema,
  GetPullRequestCommentsSchema,
  AddPullRequestCommentSchema,
  UpdatePullRequestSchema,
  GetPullRequestChangesSchema,
  GetPullRequestChecksSchema,
} from './schemas';

/**
 * List of pull requests tools
 */
export const pullRequestsTools: ToolDefinition[] = [
  {
    name: 'create_pull_request',
    description:
      'Create a new pull request, including reviewers, linked work items, and optional tags',
    inputSchema: zodToJsonSchema(CreatePullRequestSchema),
  },
  {
    name: 'list_pull_requests',
    description: 'List pull requests in a repository',
    inputSchema: zodToJsonSchema(ListPullRequestsSchema),
  },
  {
    name: 'get_pull_request_comments',
    description: 'Get comments from a specific pull request',
    inputSchema: zodToJsonSchema(GetPullRequestCommentsSchema),
  },
  {
    name: 'add_pull_request_comment',
    description:
      'Add a comment to a pull request (reply to existing comments or create new threads)',
    inputSchema: zodToJsonSchema(AddPullRequestCommentSchema),
  },
  {
    name: 'update_pull_request',
    description:
      'Update an existing pull request with new properties, manage reviewers and work items, and add or remove tags',
    inputSchema: zodToJsonSchema(UpdatePullRequestSchema),
  },
  {
    name: 'get_pull_request_changes',
    description:
      'Get the files changed in a pull request, their unified diffs, source/target branch names, and the status of policy evaluations',
    inputSchema: zodToJsonSchema(GetPullRequestChangesSchema),
  },
  {
    name: 'get_pull_request_checks',
    description: [
      'Summarize the latest status checks and policy evaluations for a pull request.',
      '- Surfaces pipeline and run identifiers so you can jump straight to the blocking validation.',
      '- Pair with pipeline tools (e.g., get_pipeline_run, pipeline_timeline) to inspect failures in depth.',
    ].join('\n'),
    inputSchema: zodToJsonSchema(GetPullRequestChecksSchema),
  },
];

import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  CreatePullRequestSchema,
  ListPullRequestsSchema,
  GetPullRequestCommentsSchema,
  AddPullRequestCommentSchema,
} from './schemas';

/**
 * List of pull requests tools
 */
export const pullRequestsTools: ToolDefinition[] = [
  {
    name: 'create_pull_request',
    description: 'Create a new pull request',
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
];

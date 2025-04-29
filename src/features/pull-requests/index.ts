export * from './schemas';
export * from './types';
export * from './create-pull-request';
export * from './list-pull-requests';
export * from './get-pull-request-comments';
export * from './add-pull-request-comment';

// Export tool definitions
export * from './tool-definitions';

// New exports for request handling
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { defaultProject } from '../../utils/environment';
import {
  CreatePullRequestSchema,
  ListPullRequestsSchema,
  GetPullRequestCommentsSchema,
  AddPullRequestCommentSchema,
  createPullRequest,
  listPullRequests,
  getPullRequestComments,
  addPullRequestComment,
} from './';

/**
 * Checks if the request is for the pull requests feature
 */
export const isPullRequestsRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return [
    'create_pull_request',
    'list_pull_requests',
    'get_pull_request_comments',
    'add_pull_request_comment',
  ].includes(toolName);
};

/**
 * Handles pull requests feature requests
 */
export const handlePullRequestsRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  switch (request.params.name) {
    case 'create_pull_request': {
      const args = CreatePullRequestSchema.parse(request.params.arguments);
      const result = await createPullRequest(
        connection,
        args.projectId ?? defaultProject,
        args.repositoryId,
        args,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'list_pull_requests': {
      const params = ListPullRequestsSchema.parse(request.params.arguments);
      const result = await listPullRequests(
        connection,
        params.projectId ?? defaultProject,
        params.repositoryId,
        {
          projectId: params.projectId ?? defaultProject,
          repositoryId: params.repositoryId,
          status: params.status,
          creatorId: params.creatorId,
          reviewerId: params.reviewerId,
          sourceRefName: params.sourceRefName,
          targetRefName: params.targetRefName,
          top: params.top,
        },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_pull_request_comments': {
      const params = GetPullRequestCommentsSchema.parse(
        request.params.arguments,
      );
      const result = await getPullRequestComments(
        connection,
        params.projectId ?? defaultProject,
        params.repositoryId,
        params.pullRequestId,
        {
          projectId: params.projectId ?? defaultProject,
          repositoryId: params.repositoryId,
          pullRequestId: params.pullRequestId,
          threadId: params.threadId,
          includeDeleted: params.includeDeleted,
          top: params.top,
        },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'add_pull_request_comment': {
      const params = AddPullRequestCommentSchema.parse(
        request.params.arguments,
      );
      const result = await addPullRequestComment(
        connection,
        params.projectId ?? defaultProject,
        params.repositoryId,
        params.pullRequestId,
        {
          projectId: params.projectId ?? defaultProject,
          repositoryId: params.repositoryId,
          pullRequestId: params.pullRequestId,
          content: params.content,
          threadId: params.threadId,
          parentCommentId: params.parentCommentId,
          filePath: params.filePath,
          lineNumber: params.lineNumber,
          status: params.status,
        },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown pull requests tool: ${request.params.name}`);
  }
};

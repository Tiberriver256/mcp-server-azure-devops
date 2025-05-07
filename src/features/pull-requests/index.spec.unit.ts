import { WebApi } from 'azure-devops-node-api';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { isPullRequestsRequest, handlePullRequestsRequest } from './index';
import { createPullRequest } from './create-pull-request';
import { listPullRequests } from './list-pull-requests';
import { getPullRequestComments } from './get-pull-request-comments';
import { addPullRequestComment } from './add-pull-request-comment';
import { AddPullRequestCommentSchema } from './schemas';

// Mock the imported modules
jest.mock('./create-pull-request', () => ({
  createPullRequest: jest.fn(),
}));

jest.mock('./list-pull-requests', () => ({
  listPullRequests: jest.fn(),
}));

jest.mock('./get-pull-request-comments', () => ({
  getPullRequestComments: jest.fn(),
}));

jest.mock('./add-pull-request-comment', () => ({
  addPullRequestComment: jest.fn(),
}));

describe('Pull Requests Request Handlers', () => {
  const mockConnection = {} as WebApi;

  describe('isPullRequestsRequest', () => {
    it('should return true for pull requests tools', () => {
      const validTools = [
        'create_pull_request',
        'list_pull_requests',
        'get_pull_request_comments',
        'add_pull_request_comment',
      ];
      validTools.forEach((tool) => {
        const request = {
          params: { name: tool, arguments: {} },
          method: 'tools/call',
        } as CallToolRequest;
        expect(isPullRequestsRequest(request)).toBe(true);
      });
    });

    it('should return false for non-pull requests tools', () => {
      const request = {
        params: { name: 'list_projects', arguments: {} },
        method: 'tools/call',
      } as CallToolRequest;
      expect(isPullRequestsRequest(request)).toBe(false);
    });
  });

  describe('handlePullRequestsRequest', () => {
    it('should handle create_pull_request request', async () => {
      const mockPullRequest = { id: 1, title: 'Test PR' };
      (createPullRequest as jest.Mock).mockResolvedValue(mockPullRequest);

      const request = {
        params: {
          name: 'create_pull_request',
          arguments: {
            repositoryId: 'test-repo',
            title: 'Test PR',
            sourceRefName: 'refs/heads/feature',
            targetRefName: 'refs/heads/main',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handlePullRequestsRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(mockPullRequest);
      expect(createPullRequest).toHaveBeenCalledWith(
        mockConnection,
        expect.any(String),
        'test-repo',
        expect.objectContaining({
          title: 'Test PR',
          sourceRefName: 'refs/heads/feature',
          targetRefName: 'refs/heads/main',
        }),
      );
    });

    it('should handle list_pull_requests request', async () => {
      const mockPullRequests = {
        count: 2,
        value: [
          { id: 1, title: 'PR 1' },
          { id: 2, title: 'PR 2' },
        ],
        hasMoreResults: false,
      };
      (listPullRequests as jest.Mock).mockResolvedValue(mockPullRequests);

      const request = {
        params: {
          name: 'list_pull_requests',
          arguments: {
            repositoryId: 'test-repo',
            status: 'active',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handlePullRequestsRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(mockPullRequests);
      expect(listPullRequests).toHaveBeenCalledWith(
        mockConnection,
        expect.any(String),
        'test-repo',
        expect.objectContaining({
          status: 'active',
        }),
      );
    });

    it('should handle get_pull_request_comments request', async () => {
      const mockComments = {
        threads: [
          {
            id: 1,
            comments: [{ id: 1, content: 'Comment 1' }],
          },
        ],
      };
      (getPullRequestComments as jest.Mock).mockResolvedValue(mockComments);

      const request = {
        params: {
          name: 'get_pull_request_comments',
          arguments: {
            repositoryId: 'test-repo',
            pullRequestId: 123,
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handlePullRequestsRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(mockComments);
      expect(getPullRequestComments).toHaveBeenCalledWith(
        mockConnection,
        expect.any(String),
        'test-repo',
        123,
        expect.objectContaining({
          pullRequestId: 123,
        }),
      );
    });

    it('should handle add_pull_request_comment request', async () => {
      const mockResult = {
        comment: { id: 1, content: 'New comment' },
        thread: { id: 1 },
      };
      (addPullRequestComment as jest.Mock).mockResolvedValue(mockResult);

      const request = {
        params: {
          name: 'add_pull_request_comment',
          arguments: {
            repositoryId: 'test-repo',
            pullRequestId: 123,
            content: 'New comment',
            status: 'active', // Status is required when creating a new thread
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      // Mock the schema parsing
      const mockParsedArgs = {
        repositoryId: 'test-repo',
        pullRequestId: 123,
        content: 'New comment',
        status: 'active',
      };

      // Use a different approach for mocking
      const originalParse = AddPullRequestCommentSchema.parse;
      AddPullRequestCommentSchema.parse = jest
        .fn()
        .mockReturnValue(mockParsedArgs);

      const response = await handlePullRequestsRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(mockResult);
      expect(addPullRequestComment).toHaveBeenCalledWith(
        mockConnection,
        expect.any(String),
        'test-repo',
        123,
        expect.objectContaining({
          content: 'New comment',
        }),
      );

      // Restore the original parse function
      AddPullRequestCommentSchema.parse = originalParse;
    });

    it('should throw error for unknown tool', async () => {
      const request = {
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
        method: 'tools/call',
      } as CallToolRequest;

      await expect(
        handlePullRequestsRequest(mockConnection, request),
      ).rejects.toThrow('Unknown pull requests tool');
    });

    it('should propagate errors from pull request functions', async () => {
      const mockError = new Error('Test error');
      (listPullRequests as jest.Mock).mockRejectedValue(mockError);

      const request = {
        params: {
          name: 'list_pull_requests',
          arguments: {
            repositoryId: 'test-repo',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      await expect(
        handlePullRequestsRequest(mockConnection, request),
      ).rejects.toThrow(mockError);
    });
  });
});

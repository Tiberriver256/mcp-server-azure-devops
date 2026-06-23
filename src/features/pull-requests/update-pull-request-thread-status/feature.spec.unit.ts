import { WebApi } from 'azure-devops-node-api';
import { updatePullRequestThreadStatus } from './feature';
import {
  CommentThreadStatus,
  CommentType,
  GitPullRequestCommentThread,
} from 'azure-devops-node-api/interfaces/GitInterfaces';

describe('updatePullRequestThreadStatus', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should update pull request thread status successfully', async () => {
    const mockThread: GitPullRequestCommentThread = {
      id: 456,
      status: CommentThreadStatus.Fixed,
      comments: [
        {
          id: 101,
          content: 'Some comment',
          commentType: CommentType.Text,
          author: { displayName: 'User' },
        },
      ],
      threadContext: {
        filePath: '/src/app.ts',
        rightFileStart: { line: 10, offset: 1 },
      },
    };

    const mockGitApi = {
      updateThread: jest.fn().mockResolvedValue(mockThread),
      getPullRequestById: jest.fn(),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const pullRequestId = 123;
    const threadId = 456;
    const options = {
      projectId,
      repositoryId,
      pullRequestId,
      threadId,
      status: 'fixed' as const,
    };

    const result = await updatePullRequestThreadStatus(
      mockConnection as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      threadId,
      options,
    );

    expect(result).toEqual({
      thread: {
        ...mockThread,
        status: 'fixed',
        comments: [
          {
            ...mockThread.comments![0],
            filePath: '/src/app.ts',
            leftFileStart: undefined,
            leftFileEnd: undefined,
            rightFileStart: { line: 10, offset: 1 },
            rightFileEnd: undefined,
            commentType: 'text',
          },
        ],
      },
    });

    expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
    expect(mockGitApi.updateThread).toHaveBeenCalledTimes(1);
    expect(mockGitApi.updateThread).toHaveBeenCalledWith(
      { status: CommentThreadStatus.Fixed },
      repositoryId,
      pullRequestId,
      threadId,
      projectId,
    );
  });

  test('should derive repositoryId from pullRequestId when repositoryId is omitted', async () => {
    const mockThread: GitPullRequestCommentThread = {
      id: 456,
      status: CommentThreadStatus.Closed,
      comments: [],
    };

    const mockGitApi = {
      getPullRequestById: jest.fn().mockResolvedValue({
        repository: { id: 'derived-repo' },
      }),
      updateThread: jest.fn().mockResolvedValue(mockThread),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const projectId = 'test-project';
    const pullRequestId = 123;
    const threadId = 456;
    const options = {
      projectId,
      pullRequestId,
      threadId,
      status: 'closed' as const,
    };

    const result = await updatePullRequestThreadStatus(
      mockConnection as WebApi,
      projectId,
      undefined,
      pullRequestId,
      threadId,
      options,
    );

    expect(result.thread.status).toBe('closed');
    expect(mockGitApi.getPullRequestById).toHaveBeenCalledWith(
      pullRequestId,
      projectId,
    );
    expect(mockGitApi.updateThread).toHaveBeenCalledWith(
      { status: CommentThreadStatus.Closed },
      'derived-repo',
      pullRequestId,
      threadId,
      projectId,
    );
  });

  test('should throw error when repositoryId cannot be derived', async () => {
    const mockGitApi = {
      getPullRequestById: jest.fn().mockResolvedValue(null),
      updateThread: jest.fn(),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const options = {
      pullRequestId: 123,
      threadId: 456,
      status: 'closed' as const,
    };

    await expect(
      updatePullRequestThreadStatus(
        mockConnection as WebApi,
        undefined,
        undefined,
        123,
        456,
        options,
      ),
    ).rejects.toThrow('repositoryId is required');
  });

  test('should throw error when status is invalid', async () => {
    const mockGitApi = {
      updateThread: jest.fn(),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const options = {
      pullRequestId: 123,
      threadId: 456,
      status: 'invalid-status' as any,
    };

    await expect(
      updatePullRequestThreadStatus(
        mockConnection as WebApi,
        'test-project',
        'test-repo',
        123,
        456,
        options,
      ),
    ).rejects.toThrow('Invalid status value: invalid-status');
  });

  test('should handle API errors correctly', async () => {
    const mockGitApi = {
      updateThread: jest.fn().mockRejectedValue(new Error('API Error')),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const options = {
      pullRequestId: 123,
      threadId: 456,
      status: 'fixed' as const,
    };

    await expect(
      updatePullRequestThreadStatus(
        mockConnection as WebApi,
        'test-project',
        'test-repo',
        123,
        456,
        options,
      ),
    ).rejects.toThrow('Failed to update pull request thread status: API Error');
  });
});

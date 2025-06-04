import { WebApi } from 'azure-devops-node-api';
import { getPullRequestComments } from './feature';
import { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';

describe('getPullRequestComments', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should return pull request comment threads with file path and line number', async () => {
    // Mock data for a comment thread
    const mockCommentThreads: GitPullRequestCommentThread[] = [
      {
        id: 1,
        status: 1, // Active
        threadContext: {
          filePath: '/src/app.ts',
          rightFileStart: {
            line: 10,
            offset: 5,
          },
          rightFileEnd: {
            line: 10,
            offset: 15,
          },
        },
        comments: [
          {
            id: 100,
            content: 'This code needs refactoring',
            commentType: 1, // CodeChange
            author: {
              displayName: 'Test User',
              id: 'test-user-id',
            },
            publishedDate: new Date(),
          },
          {
            id: 101,
            parentCommentId: 100,
            content: 'I agree, will update',
            commentType: 1, // CodeChange
            author: {
              displayName: 'Another User',
              id: 'another-user-id',
            },
            publishedDate: new Date(),
          },
        ],
      },
    ];

    // Setup mock connection
    const mockGitApi = {
      getThreads: jest.fn().mockResolvedValue(mockCommentThreads),
      getPullRequestThread: jest.fn(),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    // Call the function with test parameters
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const pullRequestId = 123;
    const options = {
      projectId,
      repositoryId,
      pullRequestId,
    };

    const result = await getPullRequestComments(
      mockConnection as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results
    expect(result).toHaveLength(1);
    expect(result[0].comments).toHaveLength(2);

    // Verify file path and line number are added to each comment
    result[0].comments?.forEach((comment) => {
      expect(comment).toHaveProperty('filePath', '/src/app.ts');
      expect(comment).toHaveProperty('rightFileStart', { line: 10, offset: 5 });
      expect(comment).toHaveProperty('rightFileEnd', { line: 10, offset: 15 });
      expect(comment).toHaveProperty('leftFileStart', undefined);
      expect(comment).toHaveProperty('leftFileEnd', undefined);
    });

    expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
    expect(mockGitApi.getThreads).toHaveBeenCalledTimes(1);
    expect(mockGitApi.getThreads).toHaveBeenCalledWith(
      repositoryId,
      pullRequestId,
      projectId,
      undefined,
      undefined,
    );
    expect(mockGitApi.getPullRequestThread).not.toHaveBeenCalled();
  });

  test('should handle comments without thread context', async () => {
    // Mock data for a comment thread without thread context
    const mockCommentThreads: GitPullRequestCommentThread[] = [
      {
        id: 1,
        status: 1, // Active
        comments: [
          {
            id: 100,
            content: 'General comment',
            commentType: 1,
            author: {
              displayName: 'Test User',
              id: 'test-user-id',
            },
            publishedDate: new Date(),
          },
        ],
      },
    ];

    // Setup mock connection
    const mockGitApi = {
      getThreads: jest.fn().mockResolvedValue(mockCommentThreads),
      getPullRequestThread: jest.fn(),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const result = await getPullRequestComments(
      mockConnection as WebApi,
      'test-project',
      'test-repo',
      123,
      {
        projectId: 'test-project',
        repositoryId: 'test-repo',
        pullRequestId: 123,
      },
    );

    // Verify results
    expect(result).toHaveLength(1);
    expect(result[0].comments).toHaveLength(1);

    // Verify file path and line number are null for comments without thread context
    const comment = result[0].comments![0];
    expect(comment).toHaveProperty('filePath', undefined);
    expect(comment).toHaveProperty('rightFileStart', null);
    expect(comment).toHaveProperty('rightFileEnd', null);
    expect(comment).toHaveProperty('leftFileStart', null);
    expect(comment).toHaveProperty('leftFileEnd', null);
  });

  test('should use leftFileStart when rightFileStart is not available', async () => {
    // Mock data for a comment thread with only leftFileStart
    const mockCommentThreads: GitPullRequestCommentThread[] = [
      {
        id: 1,
        status: 1,
        threadContext: {
          filePath: '/src/app.ts',
          leftFileStart: {
            line: 5,
            offset: 1,
          },
        },
        comments: [
          {
            id: 100,
            content: 'Comment on deleted line',
            commentType: 1,
            author: {
              displayName: 'Test User',
              id: 'test-user-id',
            },
            publishedDate: new Date(),
          },
        ],
      },
    ];

    // Setup mock connection
    const mockGitApi = {
      getThreads: jest.fn().mockResolvedValue(mockCommentThreads),
      getPullRequestThread: jest.fn(),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const result = await getPullRequestComments(
      mockConnection as WebApi,
      'test-project',
      'test-repo',
      123,
      {
        projectId: 'test-project',
        repositoryId: 'test-repo',
        pullRequestId: 123,
      },
    );

    // Verify results
    expect(result).toHaveLength(1);
    expect(result[0].comments).toHaveLength(1);

    // Verify rightFileStart is undefined, leftFileStart is present
    const comment = result[0].comments![0];
    expect(comment).toHaveProperty('filePath', '/src/app.ts');
    expect(comment).toHaveProperty('leftFileStart', { line: 5, offset: 1 });
    expect(comment).toHaveProperty('rightFileStart', undefined);
    expect(comment).toHaveProperty('leftFileEnd', undefined);
    expect(comment).toHaveProperty('rightFileEnd', undefined);
  });

  test('should return a specific comment thread when threadId is provided', async () => {
    // Mock data for a specific comment thread
    const threadId = 42;
    const mockCommentThread: GitPullRequestCommentThread = {
      id: threadId,
      status: 1, // Active
      threadContext: {
        filePath: '/src/utils.ts',
        rightFileStart: {
          line: 15,
          offset: 1,
        },
      },
      comments: [
        {
          id: 100,
          content: 'Specific comment',
          commentType: 1, // CodeChange
          author: {
            displayName: 'Test User',
            id: 'test-user-id',
          },
          publishedDate: new Date(),
        },
      ],
    };

    // Setup mock connection
    const mockGitApi = {
      getThreads: jest.fn(),
      getPullRequestThread: jest.fn().mockResolvedValue(mockCommentThread),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    // Call the function with test parameters
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const pullRequestId = 123;
    const options = {
      projectId,
      repositoryId,
      pullRequestId,
      threadId,
    };

    const result = await getPullRequestComments(
      mockConnection as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(threadId);
    expect(result[0].comments).toHaveLength(1);

    // Verify file path and line number are added
    const comment = result[0].comments![0];
    expect(comment).toHaveProperty('filePath', '/src/utils.ts');
    expect(comment).toHaveProperty('rightFileStart', { line: 15, offset: 1 });
    expect(comment).toHaveProperty('leftFileStart', undefined);
    expect(comment).toHaveProperty('leftFileEnd', undefined);
    expect(comment).toHaveProperty('rightFileEnd', undefined);

    expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
    expect(mockGitApi.getPullRequestThread).toHaveBeenCalledTimes(1);
    expect(mockGitApi.getPullRequestThread).toHaveBeenCalledWith(
      repositoryId,
      pullRequestId,
      threadId,
      projectId,
    );
    expect(mockGitApi.getThreads).not.toHaveBeenCalled();
  });

  test('should handle pagination when top parameter is provided', async () => {
    // Mock data for multiple comment threads
    const mockCommentThreads: GitPullRequestCommentThread[] = [
      {
        id: 1,
        status: 1,
        threadContext: {
          filePath: '/src/file1.ts',
          rightFileStart: { line: 1, offset: 1 },
        },
        comments: [{ id: 100, content: 'Comment 1' }],
      },
      {
        id: 2,
        status: 1,
        threadContext: {
          filePath: '/src/file2.ts',
          rightFileStart: { line: 2, offset: 1 },
        },
        comments: [{ id: 101, content: 'Comment 2' }],
      },
      {
        id: 3,
        status: 1,
        threadContext: {
          filePath: '/src/file3.ts',
          rightFileStart: { line: 3, offset: 1 },
        },
        comments: [{ id: 102, content: 'Comment 3' }],
      },
    ];

    // Setup mock connection
    const mockGitApi = {
      getThreads: jest.fn().mockResolvedValue(mockCommentThreads),
      getPullRequestThread: jest.fn(),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    // Call the function with test parameters and top=2
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const pullRequestId = 123;
    const options = {
      projectId,
      repositoryId,
      pullRequestId,
      top: 2,
    };

    const result = await getPullRequestComments(
      mockConnection as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results (should only include first 2 threads)
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      mockCommentThreads.slice(0, 2).map((thread) => ({
        ...thread,
        comments: thread.comments?.map((comment) => ({
          ...comment,
          filePath: thread.threadContext?.filePath,
          rightFileStart: thread.threadContext?.rightFileStart ?? null,
          rightFileEnd: thread.threadContext?.rightFileEnd ?? null,
          leftFileStart: thread.threadContext?.leftFileStart ?? null,
          leftFileEnd: thread.threadContext?.leftFileEnd ?? null,
        })),
      })),
    );
    expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
    expect(mockGitApi.getThreads).toHaveBeenCalledTimes(1);
    expect(result[0].comments![0]).toHaveProperty('rightFileStart', {
      line: 1,
      offset: 1,
    });
    expect(result[1].comments![0]).toHaveProperty('rightFileStart', {
      line: 2,
      offset: 1,
    });
  });

  test('should handle error when API call fails', async () => {
    // Setup mock connection with error
    const errorMessage = 'API error';
    const mockGitApi = {
      getThreads: jest.fn().mockRejectedValue(new Error(errorMessage)),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    // Call the function with test parameters
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const pullRequestId = 123;
    const options = {
      projectId,
      repositoryId,
      pullRequestId,
    };

    // Verify error handling
    await expect(
      getPullRequestComments(
        mockConnection as WebApi,
        projectId,
        repositoryId,
        pullRequestId,
        options,
      ),
    ).rejects.toThrow(`Failed to get pull request comments: ${errorMessage}`);
  });
});

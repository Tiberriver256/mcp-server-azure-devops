import { WebApi } from 'azure-devops-node-api';
import { getPullRequestComments } from './feature';
import { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';

describe('getPullRequestComments', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should return pull request comment threads successfully', async () => {
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
    expect(result).toEqual(mockCommentThreads);
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

  test('should return a specific comment thread when threadId is provided', async () => {
    // Mock data for a specific comment thread
    const threadId = 42;
    const mockCommentThread: GitPullRequestCommentThread = {
      id: threadId,
      status: 1, // Active
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
    expect(result).toEqual([mockCommentThread]);
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
        comments: [{ id: 100, content: 'Comment 1' }],
      },
      {
        id: 2,
        status: 1,
        comments: [{ id: 101, content: 'Comment 2' }],
      },
      {
        id: 3,
        status: 1,
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
    expect(result).toEqual(mockCommentThreads.slice(0, 2));
    expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
    expect(mockGitApi.getThreads).toHaveBeenCalledTimes(1);
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

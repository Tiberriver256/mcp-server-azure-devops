import { WebApi } from 'azure-devops-node-api';
import { addPullRequestComment } from './feature';
import {
  Comment,
  CommentThreadStatus,
  CommentType,
  GitPullRequestCommentThread,
} from 'azure-devops-node-api/interfaces/GitInterfaces';

describe('addPullRequestComment', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should add a comment to an existing thread successfully', async () => {
    // Mock data for a new comment
    const mockComment: Comment = {
      id: 101,
      content: 'This is a reply comment',
      commentType: CommentType.Text,
      author: {
        displayName: 'Test User',
        id: 'test-user-id',
      },
      publishedDate: new Date(),
    };

    // Setup mock connection
    const mockGitApi = {
      createComment: jest.fn().mockResolvedValue(mockComment),
      createThread: jest.fn(),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    // Call the function with test parameters
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const pullRequestId = 123;
    const threadId = 456;
    const options = {
      projectId,
      repositoryId,
      pullRequestId,
      threadId,
      content: 'This is a reply comment',
    };

    const result = await addPullRequestComment(
      mockConnection as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results (with transformed commentType)
    expect(result).toEqual({
      comment: {
        ...mockComment,
        commentType: 'text', // Transform enum to string
      },
    });
    expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
    expect(mockGitApi.createComment).toHaveBeenCalledTimes(1);
    expect(mockGitApi.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'This is a reply comment' }),
      repositoryId,
      pullRequestId,
      threadId,
      projectId,
    );
    expect(mockGitApi.createThread).not.toHaveBeenCalled();
  });

  test('should create a new thread with a comment successfully', async () => {
    // Mock data for a new thread with comment
    const mockComment: Comment = {
      id: 100,
      content: 'This is a new comment',
      commentType: CommentType.Text,
      author: {
        displayName: 'Test User',
        id: 'test-user-id',
      },
      publishedDate: new Date(),
    };

    const mockThread: GitPullRequestCommentThread = {
      id: 789,
      comments: [mockComment],
      status: CommentThreadStatus.Active,
    };

    // Setup mock connection
    const mockGitApi = {
      createComment: jest.fn(),
      createThread: jest.fn().mockResolvedValue(mockThread),
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
      content: 'This is a new comment',
      status: 'active' as const,
    };

    const result = await addPullRequestComment(
      mockConnection as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results
    expect(result).toEqual({
      comment: {
        ...mockComment,
        commentType: 'text',
      },
      thread: {
        ...mockThread,
        status: 'active',
        comments: mockThread.comments?.map((comment) => ({
          ...comment,
          commentType: 'text',
        })),
      },
    });
    expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
    expect(mockGitApi.createThread).toHaveBeenCalledTimes(1);
    expect(mockGitApi.createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        comments: [
          expect.objectContaining({ content: 'This is a new comment' }),
        ],
        status: CommentThreadStatus.Active,
      }),
      repositoryId,
      pullRequestId,
      projectId,
    );
    expect(mockGitApi.createComment).not.toHaveBeenCalled();
  });

  test('should create a new thread on a file with line number', async () => {
    // Mock data for a new thread with comment on file
    const mockComment: Comment = {
      id: 100,
      content: 'This code needs improvement',
      commentType: CommentType.Text,
      author: {
        displayName: 'Test User',
        id: 'test-user-id',
      },
      publishedDate: new Date(),
    };

    const mockThread: GitPullRequestCommentThread = {
      id: 789,
      status: CommentThreadStatus.Active, // Add missing status
      comments: [mockComment],
      threadContext: {
        filePath: '/src/app.ts',
        rightFileStart: {
          line: 42,
          offset: 1,
        },
        rightFileEnd: {
          line: 42,
          offset: 1,
        },
      },
    };

    // Setup mock connection
    const mockGitApi = {
      createComment: jest.fn(),
      createThread: jest.fn().mockResolvedValue(mockThread),
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
      content: 'This code needs improvement',
      filePath: '/src/app.ts',
      lineNumber: 42,
    };

    const result = await addPullRequestComment(
      mockConnection as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results
    expect(result).toEqual({
      comment: {
        ...mockComment,
        commentType: 'text',
      },
      thread: {
        ...mockThread,
        status: 'active',
        comments: mockThread.comments?.map((comment) => ({
          ...comment,
          commentType: 'text',
        })),
      },
    });
    expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
    expect(mockGitApi.createThread).toHaveBeenCalledTimes(1);
    expect(mockGitApi.createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        comments: [
          expect.objectContaining({ content: 'This code needs improvement' }),
        ],
        threadContext: expect.objectContaining({
          filePath: '/src/app.ts',
          rightFileStart: expect.objectContaining({ line: 42 }),
          rightFileEnd: expect.objectContaining({ line: 42 }),
        }),
      }),
      repositoryId,
      pullRequestId,
      projectId,
    );
    expect(mockGitApi.createComment).not.toHaveBeenCalled();
  });

  test('should handle error when API call fails', async () => {
    // Setup mock connection with error
    const errorMessage = 'API error';
    const mockGitApi = {
      createComment: jest.fn().mockRejectedValue(new Error(errorMessage)),
      createThread: jest.fn(),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    // Call the function with test parameters
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const pullRequestId = 123;
    const threadId = 456;
    const options = {
      projectId,
      repositoryId,
      pullRequestId,
      threadId,
      content: 'This is a reply comment',
    };

    // Verify error handling
    await expect(
      addPullRequestComment(
        mockConnection as WebApi,
        projectId,
        repositoryId,
        pullRequestId,
        options,
      ),
    ).rejects.toThrow(`Failed to add pull request comment: ${errorMessage}`);
  });

  test('should derive repositoryId from pullRequestId when repositoryId is omitted', async () => {
    // Arrange
    const mockComment: Comment = {
      id: 100,
      content: 'Derived repo comment',
      commentType: CommentType.Text,
      author: {
        displayName: 'Test User',
        id: 'test-user-id',
      },
      publishedDate: new Date(),
    };

    const mockThread: GitPullRequestCommentThread = {
      id: 789,
      comments: [mockComment],
      status: CommentThreadStatus.Active,
    };

    const mockGitApi = {
      getPullRequestById: jest.fn().mockResolvedValue({
        repository: { id: 'derived-repo' },
      }),
      createComment: jest.fn(),
      createThread: jest.fn().mockResolvedValue(mockThread),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    // Act
    const result = await addPullRequestComment(
      mockConnection as WebApi,
      'test-project',
      undefined,
      123,
      {
        projectId: 'test-project',
        pullRequestId: 123,
        content: 'Derived repo comment',
        status: 'active',
      },
    );

    // Assert
    expect(result.thread?.id).toBe(789);
    expect(mockGitApi.getPullRequestById).toHaveBeenCalledWith(
      123,
      'test-project',
    );
    expect(mockGitApi.createThread).toHaveBeenCalledWith(
      expect.any(Object),
      'derived-repo',
      123,
      'test-project',
    );
  });
});

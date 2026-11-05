import { WebApi } from 'azure-devops-node-api';
import { addPullRequestComment } from './feature';
import {
  Comment,
  CommentThreadStatus,
  CommentType,
  GitPullRequestCommentThread,
  GitVersionType,
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
          offset: 8,
        },
      },
    };

    // Lines "line 1" to "line 42", so that line 42 is 7 characters long
    const fileContent = Array.from(
      { length: 42 },
      (_, index) => `line ${index + 1}`,
    ).join('\n');

    // Setup mock connection
    const mockGitApi = {
      createComment: jest.fn(),
      createThread: jest.fn().mockResolvedValue(mockThread),
      getPullRequestById: jest.fn().mockResolvedValue({
        lastMergeSourceCommit: { commitId: 'abc123' },
      }),
      getItem: jest.fn().mockResolvedValue({ content: fileContent }),
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
        threadContext: {
          filePath: '/src/app.ts',
          rightFileStart: { line: 42, offset: 1 },
          rightFileEnd: { line: 42, offset: 8 },
        },
      }),
      repositoryId,
      pullRequestId,
      projectId,
    );
    expect(mockGitApi.getPullRequestById).toHaveBeenCalledWith(
      pullRequestId,
      projectId,
    );
    expect(mockGitApi.createComment).not.toHaveBeenCalled();
  });

  describe('file comment anchor', () => {
    const fileContent = 'line one\r\nsecond line\r\nthe third line\r\n';

    const createMockGitApi = () => ({
      createComment: jest.fn(),
      createThread: jest.fn().mockResolvedValue({
        id: 789,
        status: CommentThreadStatus.Active,
        comments: [{ id: 100, content: 'c', commentType: CommentType.Text }],
      }),
      getPullRequestById: jest.fn().mockResolvedValue({
        lastMergeSourceCommit: { commitId: 'abc123' },
      }),
      getItem: jest.fn().mockResolvedValue({ content: fileContent }),
    });

    const addComment = (mockGitApi: any, lineOptions: object) =>
      addPullRequestComment(
        { getGitApi: jest.fn().mockResolvedValue(mockGitApi) } as any,
        'test-project',
        'test-repo',
        123,
        {
          projectId: 'test-project',
          repositoryId: 'test-repo',
          pullRequestId: 123,
          content: 'c',
          filePath: '/src/app.ts',
          ...lineOptions,
        },
      );

    test('should cover the whole line so that a suggestion replaces it', async () => {
      const mockGitApi = createMockGitApi();

      await addComment(mockGitApi, { lineNumber: 2 });

      expect(mockGitApi.getItem).toHaveBeenCalledWith(
        'test-repo',
        '/src/app.ts',
        'test-project',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { version: 'abc123', versionType: GitVersionType.Commit },
        true,
      );
      expect(mockGitApi.createThread.mock.calls[0][0].threadContext).toEqual({
        filePath: '/src/app.ts',
        rightFileStart: { line: 2, offset: 1 },
        rightFileEnd: { line: 2, offset: 12 },
      });
    });

    test('should cover a range of lines up to the end of endLineNumber', async () => {
      const mockGitApi = createMockGitApi();

      await addComment(mockGitApi, { lineNumber: 1, endLineNumber: 3 });

      expect(mockGitApi.createThread.mock.calls[0][0].threadContext).toEqual({
        filePath: '/src/app.ts',
        rightFileStart: { line: 1, offset: 1 },
        rightFileEnd: { line: 3, offset: 15 },
      });
    });

    test('should not count a byte order mark as part of the first line', async () => {
      const mockGitApi = createMockGitApi();
      mockGitApi.getItem.mockResolvedValue({ content: `\uFEFF${fileContent}` });

      await addComment(mockGitApi, { lineNumber: 1 });

      expect(mockGitApi.createThread.mock.calls[0][0].threadContext).toEqual({
        filePath: '/src/app.ts',
        rightFileStart: { line: 1, offset: 1 },
        rightFileEnd: { line: 1, offset: 9 },
      });
    });

    test('should fall back to the start of the line when the file cannot be read', async () => {
      const mockGitApi = createMockGitApi();
      mockGitApi.getItem.mockRejectedValue(new Error('not found'));

      await addComment(mockGitApi, { lineNumber: 2 });

      expect(mockGitApi.createThread.mock.calls[0][0].threadContext).toEqual({
        filePath: '/src/app.ts',
        rightFileStart: { line: 2, offset: 1 },
        rightFileEnd: { line: 2, offset: 1 },
      });
    });

    test('should fall back to a single-line anchor at lineNumber when the file of a range cannot be read', async () => {
      const mockGitApi = createMockGitApi();
      mockGitApi.getItem.mockRejectedValue(new Error('not found'));

      await addComment(mockGitApi, { lineNumber: 1, endLineNumber: 3 });

      expect(mockGitApi.createThread.mock.calls[0][0].threadContext).toEqual({
        filePath: '/src/app.ts',
        rightFileStart: { line: 1, offset: 1 },
        rightFileEnd: { line: 1, offset: 1 },
      });
    });

    test('should fall back to the start of the line when the pull request has no source commit', async () => {
      const mockGitApi = createMockGitApi();
      mockGitApi.getPullRequestById.mockResolvedValue({});

      await addComment(mockGitApi, { lineNumber: 2 });

      expect(mockGitApi.getItem).not.toHaveBeenCalled();
      expect(mockGitApi.createThread.mock.calls[0][0].threadContext).toEqual({
        filePath: '/src/app.ts',
        rightFileStart: { line: 2, offset: 1 },
        rightFileEnd: { line: 2, offset: 1 },
      });
    });

    test('should fall back to a single-line anchor at lineNumber when endLineNumber is beyond the end of the file', async () => {
      const mockGitApi = createMockGitApi();

      await addComment(mockGitApi, { lineNumber: 2, endLineNumber: 10 });

      expect(mockGitApi.createThread.mock.calls[0][0].threadContext).toEqual({
        filePath: '/src/app.ts',
        rightFileStart: { line: 2, offset: 1 },
        rightFileEnd: { line: 2, offset: 1 },
      });
    });

    test('should comment on the whole file without looking it up when lineNumber is omitted', async () => {
      const mockGitApi = createMockGitApi();

      await addComment(mockGitApi, {});

      expect(mockGitApi.createThread.mock.calls[0][0].threadContext).toEqual({
        filePath: '/src/app.ts',
      });
      expect(mockGitApi.getPullRequestById).not.toHaveBeenCalled();
      expect(mockGitApi.getItem).not.toHaveBeenCalled();
    });

    test('should reuse the pull request fetched to derive repositoryId', async () => {
      const mockGitApi = createMockGitApi();
      mockGitApi.getPullRequestById.mockResolvedValue({
        repository: { id: 'derived-repo' },
        lastMergeSourceCommit: { commitId: 'abc123' },
      });

      await addPullRequestComment(
        { getGitApi: jest.fn().mockResolvedValue(mockGitApi) } as any,
        'test-project',
        undefined,
        123,
        {
          projectId: 'test-project',
          pullRequestId: 123,
          content: 'c',
          filePath: '/src/app.ts',
          lineNumber: 2,
        },
      );

      expect(mockGitApi.getPullRequestById).toHaveBeenCalledTimes(1);
      expect(mockGitApi.getItem).toHaveBeenCalledWith(
        'derived-repo',
        '/src/app.ts',
        'test-project',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { version: 'abc123', versionType: GitVersionType.Commit },
        true,
      );
      expect(mockGitApi.createThread.mock.calls[0][0].threadContext).toEqual({
        filePath: '/src/app.ts',
        rightFileStart: { line: 2, offset: 1 },
        rightFileEnd: { line: 2, offset: 12 },
      });
    });
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

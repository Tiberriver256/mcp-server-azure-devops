import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { addPullRequestComment } from './feature.ts';
import type {
  Comment,
  GitPullRequest,
  GitPullRequestCommentThread,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  CommentThreadStatus,
  CommentType,
  GitVersionType,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';

void describe('addPullRequestComment', () => {
  void test('should add a comment to an existing thread successfully', async () => {
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
      createComment: mock.fn((..._args: unknown[]) =>
        Promise.resolve(mockComment),
      ),
      createThread: mock.fn(),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
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
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results (with transformed commentType)
    assert.deepStrictEqual(result, {
      comment: {
        ...mockComment,
        commentType: 'text', // Transform enum to string
      },
    });
    assert.strictEqual(mockConnection.getGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGitApi.createComment.mock.callCount(), 1);
    const createCommentArgs = mockGitApi.createComment.mock.calls[0]?.arguments;
    assert.ok(createCommentArgs);
    assert.strictEqual(createCommentArgs.length, 5);
    assert.partialDeepStrictEqual(createCommentArgs[0], {
      content: 'This is a reply comment',
    });
    assert.deepStrictEqual(createCommentArgs.slice(1), [
      repositoryId,
      pullRequestId,
      threadId,
      projectId,
    ]);
    assert.strictEqual(mockGitApi.createThread.mock.callCount(), 0);
  });

  void test('should create a new thread with a comment successfully', async () => {
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
      createComment: mock.fn(),
      createThread: mock.fn(
        (_thread: GitPullRequestCommentThread, ..._rest: unknown[]) =>
          Promise.resolve(mockThread),
      ),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
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
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results
    assert.deepStrictEqual(result, {
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
    assert.strictEqual(mockConnection.getGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGitApi.createThread.mock.callCount(), 1);
    const createThreadArgs = mockGitApi.createThread.mock.calls[0]?.arguments;
    assert.ok(createThreadArgs);
    assert.strictEqual(createThreadArgs.length, 4);
    const [threadArg, ...restArgs] = createThreadArgs;
    assert.deepStrictEqual(restArgs, [repositoryId, pullRequestId, projectId]);
    assert.strictEqual(threadArg.status, CommentThreadStatus.Active);
    assert.ok(Array.isArray(threadArg.comments));
    assert.strictEqual(threadArg.comments.length, 1);
    assert.partialDeepStrictEqual(threadArg.comments[0], {
      content: 'This is a new comment',
    });
    assert.strictEqual(mockGitApi.createComment.mock.callCount(), 0);
  });

  void test('should create a new thread on a file with line number', async () => {
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
      createComment: mock.fn(),
      createThread: mock.fn(
        (_thread: GitPullRequestCommentThread, ..._rest: unknown[]) =>
          Promise.resolve(mockThread),
      ),
      getPullRequestById: mock.fn((..._args: unknown[]) =>
        Promise.resolve({
          lastMergeSourceCommit: { commitId: 'abc123' },
        }),
      ),
      getItem: mock.fn(() => Promise.resolve({ content: fileContent })),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
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
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results
    assert.deepStrictEqual(result, {
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
    assert.strictEqual(mockConnection.getGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGitApi.createThread.mock.callCount(), 1);
    const createThreadArgs = mockGitApi.createThread.mock.calls[0]?.arguments;
    assert.ok(createThreadArgs);
    assert.strictEqual(createThreadArgs.length, 4);
    const [threadArg, ...restArgs] = createThreadArgs;
    assert.deepStrictEqual(restArgs, [repositoryId, pullRequestId, projectId]);
    assert.ok(Array.isArray(threadArg.comments));
    assert.strictEqual(threadArg.comments.length, 1);
    assert.partialDeepStrictEqual(threadArg.comments[0], {
      content: 'This code needs improvement',
    });
    assert.deepStrictEqual(threadArg.threadContext, {
      filePath: '/src/app.ts',
      rightFileStart: { line: 42, offset: 1 },
      rightFileEnd: { line: 42, offset: 8 },
    });
    assert.strictEqual(mockGitApi.getPullRequestById.mock.callCount(), 1);
    assert.deepStrictEqual(
      mockGitApi.getPullRequestById.mock.calls[0]?.arguments,
      [pullRequestId, projectId],
    );
    assert.strictEqual(mockGitApi.createComment.mock.callCount(), 0);
  });

  void describe('file comment anchor', () => {
    const fileContent = 'line one\r\nsecond line\r\nthe third line\r\n';

    const createMockGitApi = () => ({
      createComment: mock.fn(),
      createThread: mock.fn(
        (_thread: GitPullRequestCommentThread, ..._rest: unknown[]) =>
          Promise.resolve<GitPullRequestCommentThread>({
            id: 789,
            status: CommentThreadStatus.Active,
            comments: [
              { id: 100, content: 'c', commentType: CommentType.Text },
            ],
          }),
      ),
      getPullRequestById: mock.fn(
        (..._args: unknown[]): Promise<Partial<GitPullRequest>> =>
          Promise.resolve({
            lastMergeSourceCommit: { commitId: 'abc123' },
          }),
      ),
      getItem: mock.fn((..._args: unknown[]): Promise<{ content?: string }> =>
        Promise.resolve({ content: fileContent }),
      ),
    });

    const addComment = (
      mockGitApi: ReturnType<typeof createMockGitApi>,
      lineOptions: object,
    ) =>
      addPullRequestComment(
        {
          getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
        } as unknown as WebApi,
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

    void test('should cover the whole line so that a suggestion replaces it', async () => {
      const mockGitApi = createMockGitApi();

      await addComment(mockGitApi, { lineNumber: 2 });

      assert.strictEqual(mockGitApi.getItem.mock.callCount(), 1);
      assert.deepStrictEqual(mockGitApi.getItem.mock.calls[0]?.arguments, [
        'test-repo',
        '/src/app.ts',
        'test-project',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { version: 'abc123', versionType: GitVersionType.Commit },
        true, // includeContent
        true, // resolveLfs
      ]);
      assert.deepStrictEqual(
        mockGitApi.createThread.mock.calls[0]?.arguments[0]?.threadContext,
        {
          filePath: '/src/app.ts',
          rightFileStart: { line: 2, offset: 1 },
          rightFileEnd: { line: 2, offset: 12 },
        },
      );
    });

    void test('should cover a range of lines up to the end of endLineNumber', async () => {
      const mockGitApi = createMockGitApi();

      await addComment(mockGitApi, { lineNumber: 1, endLineNumber: 3 });

      assert.deepStrictEqual(
        mockGitApi.createThread.mock.calls[0]?.arguments[0]?.threadContext,
        {
          filePath: '/src/app.ts',
          rightFileStart: { line: 1, offset: 1 },
          rightFileEnd: { line: 3, offset: 15 },
        },
      );
    });

    const lineBreakCases = [
      ['LF', 'line one\nsecond line\nthe third line'],
      ['CR', 'line one\rsecond line\rthe third line'],
      ['mixed', 'line one\rsecond line\nthe third line'],
    ] as const;

    for (const [label, content] of lineBreakCases) {
      void test(`should count ${label} line breaks like the diff view`, async () => {
        const mockGitApi = createMockGitApi();
        mockGitApi.getItem.mock.mockImplementation(() =>
          Promise.resolve({ content }),
        );

        await addComment(mockGitApi, { lineNumber: 2, endLineNumber: 3 });

        assert.deepStrictEqual(
          mockGitApi.createThread.mock.calls[0]?.arguments[0]?.threadContext,
          {
            filePath: '/src/app.ts',
            rightFileStart: { line: 2, offset: 1 },
            rightFileEnd: { line: 3, offset: 15 },
          },
        );
      });
    }

    void test('should not count a byte order mark as part of the first line', async () => {
      const mockGitApi = createMockGitApi();
      mockGitApi.getItem.mock.mockImplementation(() =>
        Promise.resolve({ content: `\uFEFF${fileContent}` }),
      );

      await addComment(mockGitApi, { lineNumber: 1 });

      assert.deepStrictEqual(
        mockGitApi.createThread.mock.calls[0]?.arguments[0]?.threadContext,
        {
          filePath: '/src/app.ts',
          rightFileStart: { line: 1, offset: 1 },
          rightFileEnd: { line: 1, offset: 9 },
        },
      );
    });

    void test('should fall back to the start of the line when the file cannot be read', async () => {
      const mockGitApi = createMockGitApi();
      mockGitApi.getItem.mock.mockImplementation(() =>
        Promise.reject(new Error('not found')),
      );

      await addComment(mockGitApi, { lineNumber: 2 });

      assert.deepStrictEqual(
        mockGitApi.createThread.mock.calls[0]?.arguments[0]?.threadContext,
        {
          filePath: '/src/app.ts',
          rightFileStart: { line: 2, offset: 1 },
          rightFileEnd: { line: 2, offset: 1 },
        },
      );
    });

    void test('should fall back to a single-line anchor at lineNumber when the file of a range cannot be read', async () => {
      const mockGitApi = createMockGitApi();
      mockGitApi.getItem.mock.mockImplementation(() =>
        Promise.reject(new Error('not found')),
      );

      await addComment(mockGitApi, { lineNumber: 1, endLineNumber: 3 });

      assert.deepStrictEqual(
        mockGitApi.createThread.mock.calls[0]?.arguments[0]?.threadContext,
        {
          filePath: '/src/app.ts',
          rightFileStart: { line: 1, offset: 1 },
          rightFileEnd: { line: 1, offset: 1 },
        },
      );
    });

    void test('should fall back to the start of the line when the pull request has no source commit', async () => {
      const mockGitApi = createMockGitApi();
      mockGitApi.getPullRequestById.mock.mockImplementation(() =>
        Promise.resolve({}),
      );

      await addComment(mockGitApi, { lineNumber: 2 });

      assert.strictEqual(mockGitApi.getItem.mock.callCount(), 0);
      assert.deepStrictEqual(
        mockGitApi.createThread.mock.calls[0]?.arguments[0]?.threadContext,
        {
          filePath: '/src/app.ts',
          rightFileStart: { line: 2, offset: 1 },
          rightFileEnd: { line: 2, offset: 1 },
        },
      );
    });

    void test('should fall back to a single-line anchor at lineNumber when endLineNumber is beyond the end of the file', async () => {
      const mockGitApi = createMockGitApi();

      await addComment(mockGitApi, { lineNumber: 2, endLineNumber: 10 });

      assert.deepStrictEqual(
        mockGitApi.createThread.mock.calls[0]?.arguments[0]?.threadContext,
        {
          filePath: '/src/app.ts',
          rightFileStart: { line: 2, offset: 1 },
          rightFileEnd: { line: 2, offset: 1 },
        },
      );
    });

    void test('should comment on the whole file without looking it up when lineNumber is omitted', async () => {
      const mockGitApi = createMockGitApi();

      await addComment(mockGitApi, {});

      assert.deepStrictEqual(
        mockGitApi.createThread.mock.calls[0]?.arguments[0]?.threadContext,
        {
          filePath: '/src/app.ts',
        },
      );
      assert.strictEqual(mockGitApi.getPullRequestById.mock.callCount(), 0);
      assert.strictEqual(mockGitApi.getItem.mock.callCount(), 0);
    });

    void test('should reuse the pull request fetched to derive repositoryId', async () => {
      const mockGitApi = createMockGitApi();
      mockGitApi.getPullRequestById.mock.mockImplementation(() =>
        Promise.resolve({
          repository: { id: 'derived-repo' },
          lastMergeSourceCommit: { commitId: 'abc123' },
        }),
      );

      await addPullRequestComment(
        {
          getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
        } as unknown as WebApi,
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

      assert.strictEqual(mockGitApi.getPullRequestById.mock.callCount(), 1);
      assert.strictEqual(mockGitApi.getItem.mock.callCount(), 1);
      assert.deepStrictEqual(mockGitApi.getItem.mock.calls[0]?.arguments, [
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
        true,
      ]);
      assert.deepStrictEqual(
        mockGitApi.createThread.mock.calls[0]?.arguments[0]?.threadContext,
        {
          filePath: '/src/app.ts',
          rightFileStart: { line: 2, offset: 1 },
          rightFileEnd: { line: 2, offset: 12 },
        },
      );
    });
  });

  void test('should handle error when API call fails', async () => {
    // Setup mock connection with error
    const errorMessage = 'API error';
    const mockGitApi = {
      createComment: mock.fn(() => Promise.reject(new Error(errorMessage))),
      createThread: mock.fn(),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
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
    await assert.rejects(
      () =>
        addPullRequestComment(
          mockConnection as unknown as WebApi,
          projectId,
          repositoryId,
          pullRequestId,
          options,
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes(
            `Failed to add pull request comment: ${errorMessage}`,
          ),
        );
        return true;
      },
    );
  });

  void test('should derive repositoryId from pullRequestId when repositoryId is omitted', async () => {
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
      getPullRequestById: mock.fn((..._args: unknown[]) =>
        Promise.resolve({
          repository: { id: 'derived-repo' },
        }),
      ),
      createComment: mock.fn(),
      createThread: mock.fn((..._args: unknown[]) =>
        Promise.resolve(mockThread),
      ),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    };

    // Act
    const result = await addPullRequestComment(
      mockConnection as unknown as WebApi,
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
    assert.strictEqual(result.thread?.id, 789);
    assert.strictEqual(mockGitApi.getPullRequestById.mock.callCount(), 1);
    assert.deepStrictEqual(
      mockGitApi.getPullRequestById.mock.calls[0]?.arguments,
      [123, 'test-project'],
    );
    assert.strictEqual(mockGitApi.createThread.mock.callCount(), 1);
    const createThreadArgs = mockGitApi.createThread.mock.calls[0]?.arguments;
    assert.ok(createThreadArgs);
    assert.strictEqual(createThreadArgs.length, 4);
    assert.strictEqual(typeof createThreadArgs[0], 'object');
    assert.notStrictEqual(createThreadArgs[0], null);
    assert.deepStrictEqual(createThreadArgs.slice(1), [
      'derived-repo',
      123,
      'test-project',
    ]);
  });
});

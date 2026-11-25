import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getPullRequestComments } from './feature.ts';
import type { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces.js';

void describe('getPullRequestComments', () => {
  void test('should return pull request comment threads with file path and line number', async () => {
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
      getThreads: mock.fn((..._args: unknown[]) =>
        Promise.resolve(mockCommentThreads),
      ),
      getPullRequestThread: mock.fn(),
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
    };

    const result = await getPullRequestComments(
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].comments);
    assert.strictEqual(result[0].comments.length, 2);

    // Verify file path and line number are added to each comment
    for (const comment of result[0].comments) {
      assert.ok(Object.hasOwn(comment, 'filePath'));
      assert.strictEqual(comment.filePath, '/src/app.ts');
      assert.ok(Object.hasOwn(comment, 'rightFileStart'));
      assert.deepStrictEqual(comment.rightFileStart, { line: 10, offset: 5 });
      assert.ok(Object.hasOwn(comment, 'rightFileEnd'));
      assert.deepStrictEqual(comment.rightFileEnd, { line: 10, offset: 15 });
      assert.ok(Object.hasOwn(comment, 'leftFileStart'));
      assert.strictEqual(comment.leftFileStart, undefined);
      assert.ok(Object.hasOwn(comment, 'leftFileEnd'));
      assert.strictEqual(comment.leftFileEnd, undefined);
    }

    assert.strictEqual(mockConnection.getGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGitApi.getThreads.mock.callCount(), 1);
    assert.deepStrictEqual(mockGitApi.getThreads.mock.calls[0]?.arguments, [
      repositoryId,
      pullRequestId,
      projectId,
      undefined,
      undefined,
    ]);
    assert.strictEqual(mockGitApi.getPullRequestThread.mock.callCount(), 0);
  });

  void test('should handle comments without thread context', async () => {
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
      getThreads: mock.fn(() => Promise.resolve(mockCommentThreads)),
      getPullRequestThread: mock.fn(),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    };

    const result = await getPullRequestComments(
      mockConnection as unknown as WebApi,
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
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].comments?.length, 1);
    assert.strictEqual(result[0].status, 'active');

    // Verify file path and line number are null for comments without thread context
    const comment = result[0].comments?.[0];
    assert.ok(comment);
    assert.ok(Object.hasOwn(comment, 'filePath'));
    assert.strictEqual(comment.filePath, undefined);
    assert.ok(Object.hasOwn(comment, 'rightFileStart'));
    assert.strictEqual(comment.rightFileStart, undefined);
    assert.ok(Object.hasOwn(comment, 'rightFileEnd'));
    assert.strictEqual(comment.rightFileEnd, undefined);
    assert.ok(Object.hasOwn(comment, 'leftFileStart'));
    assert.strictEqual(comment.leftFileStart, undefined);
    assert.ok(Object.hasOwn(comment, 'leftFileEnd'));
    assert.strictEqual(comment.leftFileEnd, undefined);
    assert.ok(Object.hasOwn(comment, 'commentType'));
    assert.strictEqual(comment.commentType, 'text');
  });

  void test('should use leftFileStart when rightFileStart is not available', async () => {
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
      getThreads: mock.fn(() => Promise.resolve(mockCommentThreads)),
      getPullRequestThread: mock.fn(),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    };

    const result = await getPullRequestComments(
      mockConnection as unknown as WebApi,
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
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].comments?.length, 1);

    // Verify rightFileStart is undefined, leftFileStart is present
    const comment = result[0].comments?.[0];
    assert.ok(comment);
    assert.ok(Object.hasOwn(comment, 'filePath'));
    assert.strictEqual(comment.filePath, '/src/app.ts');
    assert.ok(Object.hasOwn(comment, 'leftFileStart'));
    assert.deepStrictEqual(comment.leftFileStart, { line: 5, offset: 1 });
    assert.ok(Object.hasOwn(comment, 'rightFileStart'));
    assert.strictEqual(comment.rightFileStart, undefined);
    assert.ok(Object.hasOwn(comment, 'leftFileEnd'));
    assert.strictEqual(comment.leftFileEnd, undefined);
    assert.ok(Object.hasOwn(comment, 'rightFileEnd'));
    assert.strictEqual(comment.rightFileEnd, undefined);
  });

  void test('should return a specific comment thread when threadId is provided', async () => {
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
      getThreads: mock.fn(),
      getPullRequestThread: mock.fn((..._args: unknown[]) =>
        Promise.resolve(mockCommentThread),
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
      threadId,
    };

    const result = await getPullRequestComments(
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, threadId);
    assert.strictEqual(result[0].comments?.length, 1);

    // Verify file path and line number are added
    const comment = result[0].comments?.[0];
    assert.ok(comment);
    assert.ok(Object.hasOwn(comment, 'filePath'));
    assert.strictEqual(comment.filePath, '/src/utils.ts');
    assert.ok(Object.hasOwn(comment, 'rightFileStart'));
    assert.deepStrictEqual(comment.rightFileStart, { line: 15, offset: 1 });
    assert.ok(Object.hasOwn(comment, 'leftFileStart'));
    assert.strictEqual(comment.leftFileStart, undefined);
    assert.ok(Object.hasOwn(comment, 'leftFileEnd'));
    assert.strictEqual(comment.leftFileEnd, undefined);
    assert.ok(Object.hasOwn(comment, 'rightFileEnd'));
    assert.strictEqual(comment.rightFileEnd, undefined);

    assert.strictEqual(mockConnection.getGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGitApi.getPullRequestThread.mock.callCount(), 1);
    assert.deepStrictEqual(
      mockGitApi.getPullRequestThread.mock.calls[0]?.arguments,
      [repositoryId, pullRequestId, threadId, projectId],
    );
    assert.strictEqual(mockGitApi.getThreads.mock.callCount(), 0);
  });

  void test('should handle pagination when top parameter is provided', async () => {
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
      getThreads: mock.fn(() => Promise.resolve(mockCommentThreads)),
      getPullRequestThread: mock.fn(),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
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
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      options,
    );

    // Verify results (should only include first 2 threads)
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(
      result,
      mockCommentThreads.slice(0, 2).map((thread) => ({
        ...thread,
        status: 'active', // Transform enum to string
        comments: thread.comments?.map((comment) => ({
          ...comment,
          commentType: undefined, // Will be undefined since mock doesn't have commentType
          filePath: thread.threadContext?.filePath,
          rightFileStart: thread.threadContext?.rightFileStart ?? undefined,
          rightFileEnd: thread.threadContext?.rightFileEnd ?? undefined,
          leftFileStart: thread.threadContext?.leftFileStart ?? undefined,
          leftFileEnd: thread.threadContext?.leftFileEnd ?? undefined,
        })),
      })),
    );
    assert.strictEqual(mockConnection.getGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGitApi.getThreads.mock.callCount(), 1);
    const firstComment = result[0].comments?.[0];
    assert.ok(firstComment);
    assert.ok(Object.hasOwn(firstComment, 'rightFileStart'));
    assert.deepStrictEqual(firstComment.rightFileStart, {
      line: 1,
      offset: 1,
    });
    const secondComment = result[1].comments?.[0];
    assert.ok(secondComment);
    assert.ok(Object.hasOwn(secondComment, 'rightFileStart'));
    assert.deepStrictEqual(secondComment.rightFileStart, {
      line: 2,
      offset: 1,
    });
  });

  void test('should handle error when API call fails', async () => {
    // Setup mock connection with error
    const errorMessage = 'API error';
    const mockGitApi = {
      getThreads: mock.fn(() => Promise.reject(new Error(errorMessage))),
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
    };

    // Verify error handling
    await assert.rejects(
      () =>
        getPullRequestComments(
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
            `Failed to get pull request comments: ${errorMessage}`,
          ),
        );
        return true;
      },
    );
  });
});

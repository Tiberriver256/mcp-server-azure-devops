import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { updatePullRequestThreadStatus } from './feature.ts';
import type {
  Comment,
  GitPullRequestCommentThread,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  CommentThreadStatus,
  CommentType,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';

void describe('updatePullRequestThreadStatus', () => {
  void test('should update pull request thread status successfully', async () => {
    const mockComment: Comment = {
      id: 101,
      content: 'Some comment',
      commentType: CommentType.Text,
      author: { displayName: 'User' },
    };

    const mockThread: GitPullRequestCommentThread = {
      id: 456,
      status: CommentThreadStatus.Fixed,
      comments: [mockComment],
      threadContext: {
        filePath: '/src/app.ts',
        rightFileStart: { line: 10, offset: 1 },
      },
    };

    const mockGitApi = {
      updateThread: mock.fn((..._args: unknown[]) =>
        Promise.resolve(mockThread),
      ),
      getPullRequestById: mock.fn(),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
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
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      threadId,
      options,
    );

    assert.deepStrictEqual(result, {
      thread: {
        ...mockThread,
        status: 'fixed',
        comments: [
          {
            ...mockComment,
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

    assert.strictEqual(mockConnection.getGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGitApi.updateThread.mock.callCount(), 1);
    assert.deepStrictEqual(mockGitApi.updateThread.mock.calls[0]?.arguments, [
      { status: CommentThreadStatus.Fixed },
      repositoryId,
      pullRequestId,
      threadId,
      projectId,
    ]);
  });

  void test('should derive repositoryId from pullRequestId when repositoryId is omitted', async () => {
    const mockThread: GitPullRequestCommentThread = {
      id: 456,
      status: CommentThreadStatus.Closed,
      comments: [],
    };

    const mockGitApi = {
      getPullRequestById: mock.fn((..._args: unknown[]) =>
        Promise.resolve({
          repository: { id: 'derived-repo' },
        }),
      ),
      updateThread: mock.fn((..._args: unknown[]) =>
        Promise.resolve(mockThread),
      ),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
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
      mockConnection as unknown as WebApi,
      projectId,
      undefined,
      pullRequestId,
      threadId,
      options,
    );

    assert.strictEqual(result.thread.status, 'closed');
    assert.strictEqual(mockGitApi.getPullRequestById.mock.callCount(), 1);
    assert.deepStrictEqual(
      mockGitApi.getPullRequestById.mock.calls[0]?.arguments,
      [pullRequestId, projectId],
    );
    assert.strictEqual(mockGitApi.updateThread.mock.callCount(), 1);
    assert.deepStrictEqual(mockGitApi.updateThread.mock.calls[0]?.arguments, [
      { status: CommentThreadStatus.Closed },
      'derived-repo',
      pullRequestId,
      threadId,
      projectId,
    ]);
  });

  void test('should throw error when repositoryId cannot be derived', async () => {
    const mockGitApi = {
      getPullRequestById: mock.fn(() => Promise.resolve(null)),
      updateThread: mock.fn(),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    };

    const options = {
      pullRequestId: 123,
      threadId: 456,
      status: 'closed' as const,
    };

    await assert.rejects(
      () =>
        updatePullRequestThreadStatus(
          mockConnection as unknown as WebApi,
          undefined,
          undefined,
          123,
          456,
          options,
        ),
      /repositoryId is required/,
    );
  });

  void test('should throw error when status is invalid', async () => {
    const mockGitApi = {
      updateThread: mock.fn(),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    };

    const options = {
      pullRequestId: 123,
      threadId: 456,
      status: 'invalid-status' as never,
    };

    await assert.rejects(
      () =>
        updatePullRequestThreadStatus(
          mockConnection as unknown as WebApi,
          'test-project',
          'test-repo',
          123,
          456,
          options,
        ),
      /Invalid status value: invalid-status/,
    );
  });

  void test('should handle API errors correctly', async () => {
    const mockGitApi = {
      updateThread: mock.fn(() => Promise.reject(new Error('API Error'))),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    };

    const options = {
      pullRequestId: 123,
      threadId: 456,
      status: 'fixed' as const,
    };

    await assert.rejects(
      () =>
        updatePullRequestThreadStatus(
          mockConnection as unknown as WebApi,
          'test-project',
          'test-repo',
          123,
          456,
          options,
        ),
      /Failed to update pull request thread status: API Error/,
    );
  });
});

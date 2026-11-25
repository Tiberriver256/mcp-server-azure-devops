import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { createPullRequest } from './feature.ts';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';

void describe('createPullRequest unit', () => {
  // Test for required fields validation
  void test('should throw error when title is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection = {
      getGitApi: mock.fn(),
    } as unknown as WebApi;

    // Act & Assert
    await assert.rejects(
      () =>
        createPullRequest(mockConnection, 'TestProject', 'TestRepo', {
          title: '',
          sourceRefName: 'refs/heads/feature-branch',
          targetRefName: 'refs/heads/main',
        }),
      /Title is required/,
    );
  });

  void test('should throw error when source branch is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection = {
      getGitApi: mock.fn(),
    } as unknown as WebApi;

    // Act & Assert
    await assert.rejects(
      () =>
        createPullRequest(mockConnection, 'TestProject', 'TestRepo', {
          title: 'Test PR',
          sourceRefName: '',
          targetRefName: 'refs/heads/main',
        }),
      /Source branch is required/,
    );
  });

  void test('should throw error when target branch is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection = {
      getGitApi: mock.fn(),
    } as unknown as WebApi;

    // Act & Assert
    await assert.rejects(
      () =>
        createPullRequest(mockConnection, 'TestProject', 'TestRepo', {
          title: 'Test PR',
          sourceRefName: 'refs/heads/feature-branch',
          targetRefName: '',
        }),
      /Target branch is required/,
    );
  });

  // Test for error propagation
  void test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection = {
      getGitApi: mock.fn(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    } as unknown as WebApi;

    // Act & Assert
    await assert.rejects(
      () =>
        createPullRequest(mockConnection, 'TestProject', 'TestRepo', {
          title: 'Test PR',
          sourceRefName: 'refs/heads/feature-branch',
          targetRefName: 'refs/heads/main',
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsError);
        assert.strictEqual(err.message, 'Custom error');
        return true;
      },
    );
  });

  void test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection = {
      getGitApi: mock.fn(() => {
        throw new Error('Unexpected error');
      }),
    } as unknown as WebApi;

    // Act & Assert
    await assert.rejects(
      () =>
        createPullRequest(mockConnection, 'TestProject', 'TestRepo', {
          title: 'Test PR',
          sourceRefName: 'refs/heads/feature-branch',
          targetRefName: 'refs/heads/main',
        }),
      /Failed to create pull request: Unexpected error/,
    );
  });

  void test('should apply unique trimmed tags to the pull request', async () => {
    const createPullRequestMock = mock.fn(
      (_pr: { labels?: Array<{ name?: string }> }, ..._rest: unknown[]) =>
        Promise.resolve({
          pullRequestId: 99,
          labels: [{ name: 'existing' }],
        }),
    );
    const createPullRequestLabelMock = mock.fn(
      (label: { name: string }, ..._rest: unknown[]) =>
        Promise.resolve({
          name: label.name,
        }),
    );

    const mockConnection = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          createPullRequest: createPullRequestMock,
          createPullRequestLabel: createPullRequestLabelMock,
        }),
      ),
    } as unknown as WebApi;

    const result = await createPullRequest(
      mockConnection,
      'TestProject',
      'TestRepo',
      {
        title: 'Test PR',
        sourceRefName: 'refs/heads/feature-branch',
        targetRefName: 'refs/heads/main',
        tags: ['Tag-One', 'tag-one', ' Tag-Two ', ''],
      },
    );

    assert.strictEqual(createPullRequestMock.mock.callCount(), 1);
    const createPrArgs = createPullRequestMock.mock.calls[0]?.arguments;
    assert.ok(createPrArgs);
    assert.strictEqual(createPrArgs.length, 3);
    assert.deepStrictEqual(createPrArgs[0].labels, [
      { name: 'Tag-One' },
      { name: 'Tag-Two' },
    ]);
    assert.deepStrictEqual(createPrArgs.slice(1), ['TestRepo', 'TestProject']);

    assert.strictEqual(createPullRequestLabelMock.mock.callCount(), 2);
    assert.deepStrictEqual(
      createPullRequestLabelMock.mock.calls[0]?.arguments,
      [{ name: 'Tag-One' }, 'TestRepo', 99, 'TestProject'],
    );
    assert.deepStrictEqual(
      createPullRequestLabelMock.mock.calls[1]?.arguments,
      [{ name: 'Tag-Two' }, 'TestRepo', 99, 'TestProject'],
    );
    assert.deepStrictEqual(result.labels, [
      { name: 'existing' },
      { name: 'Tag-One' },
      { name: 'Tag-Two' },
    ]);
  });
});

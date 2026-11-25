import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { listPullRequests } from './feature.ts';
import { PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces.js';

void describe('listPullRequests', () => {
  void test('should return pull requests successfully with pagination metadata', async () => {
    // Mock data
    const mockPullRequests = [
      {
        pullRequestId: 1,
        title: 'Test PR 1',
        description: 'Test PR description 1',
      },
      {
        pullRequestId: 2,
        title: 'Test PR 2',
        description: 'Test PR description 2',
      },
    ];

    // Setup mock connection
    const mockGitApi = {
      getPullRequests: mock.fn((..._args: unknown[]) =>
        Promise.resolve(mockPullRequests),
      ),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    };

    // Call the function with test parameters
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const options = {
      projectId,
      repositoryId,
      status: 'active' as const,
      top: 10,
    };

    const result = await listPullRequests(
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      options,
    );

    // Verify results
    assert.deepStrictEqual(result, {
      count: 2,
      value: mockPullRequests,
      hasMoreResults: false,
      warning: undefined,
    });
    assert.strictEqual(mockConnection.getGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGitApi.getPullRequests.mock.callCount(), 1);
    assert.deepStrictEqual(
      mockGitApi.getPullRequests.mock.calls[0]?.arguments,
      [
        repositoryId,
        { status: PullRequestStatus.Active },
        projectId,
        undefined, // maxCommentLength
        0, // skip
        10, // top
      ],
    );
  });

  void test('should return empty array when no pull requests exist', async () => {
    // Setup mock connection
    const mockGitApi = {
      getPullRequests: mock.fn(() => Promise.resolve(null)),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    };

    // Call the function with test parameters
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const options = { projectId, repositoryId };

    const result = await listPullRequests(
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      options,
    );

    // Verify results
    assert.deepStrictEqual(result, {
      count: 0,
      value: [],
      hasMoreResults: false,
      warning: undefined,
    });
    assert.strictEqual(mockConnection.getGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGitApi.getPullRequests.mock.callCount(), 1);
  });

  void test('should handle all filter options correctly', async () => {
    // Setup mock connection
    const mockGitApi = {
      getPullRequests: mock.fn((..._args: unknown[]) => Promise.resolve([])),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    };

    // Call with all options
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const options = {
      projectId,
      repositoryId,
      status: 'completed' as const,
      creatorId: 'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8',
      reviewerId: 'b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9',
      sourceRefName: 'refs/heads/source-branch',
      targetRefName: 'refs/heads/target-branch',
      top: 5,
      skip: 10,
    };

    await listPullRequests(
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      options,
    );

    // Verify the search criteria was constructed correctly
    assert.strictEqual(mockGitApi.getPullRequests.mock.callCount(), 1);
    assert.deepStrictEqual(
      mockGitApi.getPullRequests.mock.calls[0]?.arguments,
      [
        repositoryId,
        {
          status: PullRequestStatus.Completed,
          creatorId: 'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8',
          reviewerId: 'b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9',
          sourceRefName: 'refs/heads/source-branch',
          targetRefName: 'refs/heads/target-branch',
        },
        projectId,
        undefined, // maxCommentLength
        10, // skip
        5, // top
      ],
    );
  });

  void test('should throw error when API call fails', async () => {
    // Setup mock connection
    const errorMessage = 'API error';
    const mockConnection = {
      getGitApi: mock.fn(() => ({
        getPullRequests: mock.fn(() => Promise.reject(new Error(errorMessage))),
      })),
    };

    // Call the function with test parameters
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const options = { projectId, repositoryId };

    // Verify error handling
    await assert.rejects(
      () =>
        listPullRequests(
          mockConnection as unknown as WebApi,
          projectId,
          repositoryId,
          options,
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes(`Failed to list pull requests: ${errorMessage}`),
        );
        return true;
      },
    );
  });

  void test('should use default pagination values when not provided', async () => {
    // Mock data
    const mockPullRequests = [
      { pullRequestId: 1, title: 'Test PR 1' },
      { pullRequestId: 2, title: 'Test PR 2' },
    ];

    // Setup mock connection
    const mockGitApi = {
      getPullRequests: mock.fn((..._args: unknown[]) =>
        Promise.resolve(mockPullRequests),
      ),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    };

    // Call the function with minimal parameters (no top or skip)
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const options = { projectId, repositoryId };

    const result = await listPullRequests(
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      options,
    );

    // Verify default values were used
    assert.strictEqual(mockGitApi.getPullRequests.mock.callCount(), 1);
    assert.deepStrictEqual(
      mockGitApi.getPullRequests.mock.calls[0]?.arguments,
      [
        repositoryId,
        {},
        projectId,
        undefined, // maxCommentLength
        0, // default skip
        10, // default top
      ],
    );

    assert.strictEqual(result.count, 2);
    assert.deepStrictEqual(result.value, mockPullRequests);
  });

  void test('should add warning when hasMoreResults is true', async () => {
    // Create exactly 10 mock pull requests to trigger hasMoreResults
    const mockPullRequests = Array(10)
      .fill(0)
      .map((_, i) => ({
        pullRequestId: i + 1,
        title: `Test PR ${i + 1}`,
      }));

    // Setup mock connection
    const mockGitApi = {
      getPullRequests: mock.fn(() => Promise.resolve(mockPullRequests)),
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    };

    // Call with top=10 to match the number of results
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const options = {
      projectId,
      repositoryId,
      top: 10,
      skip: 5,
    };

    const result = await listPullRequests(
      mockConnection as unknown as WebApi,
      projectId,
      repositoryId,
      options,
    );

    // Verify hasMoreResults is true and warning is set
    assert.strictEqual(result.hasMoreResults, true);
    assert.strictEqual(
      result.warning,
      "Results limited to 10 items. Use 'skip: 15' to get the next page.",
    );
  });
});

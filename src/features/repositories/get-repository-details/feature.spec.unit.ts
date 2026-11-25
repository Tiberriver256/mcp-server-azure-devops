import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { getRepositoryDetails } from './feature.ts';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors/index.ts';
import type { GitRepository, GitBranchStats, GitRef } from '../types.ts';

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
void describe('getRepositoryDetails unit', () => {
  // Mock repository data
  const mockRepository: GitRepository = {
    id: 'repo-id',
    name: 'test-repo',
    url: 'https://dev.azure.com/org/project/_apis/git/repositories/repo-id',
    project: {
      id: 'project-id',
      name: 'test-project',
    },
    defaultBranch: 'refs/heads/main',
    size: 1024,
    remoteUrl: 'https://dev.azure.com/org/project/_git/test-repo',
    sshUrl: 'git@ssh.dev.azure.com:v3/org/project/test-repo',
    webUrl: 'https://dev.azure.com/org/project/_git/test-repo',
  };

  // Mock branch stats data
  const mockBranchStats: GitBranchStats[] = [
    {
      name: 'refs/heads/main',
      aheadCount: 0,
      behindCount: 0,
      isBaseVersion: true,
      commit: {
        commitId: 'commit-id',
        author: {
          name: 'Test User',
          email: 'test@example.com',
          date: new Date(),
        },
        committer: {
          name: 'Test User',
          email: 'test@example.com',
          date: new Date(),
        },
        comment: 'Test commit',
      },
    },
  ];

  // Mock refs data
  const mockRefs: GitRef[] = [
    {
      name: 'refs/heads/main',
      objectId: 'commit-id',
      creator: {
        displayName: 'Test User',
        id: 'user-id',
      },
      url: 'https://dev.azure.com/org/project/_apis/git/repositories/repo-id/refs/heads/main',
    },
  ];

  void test('should return basic repository information when no additional options are specified', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: mock.fn(() => ({
        getRepository: mock.fn(() => Promise.resolve(mockRepository)),
      })),
    };

    // Act
    const result = await getRepositoryDetails(mockConnection, {
      projectId: 'test-project',
      repositoryId: 'test-repo',
    });

    // Assert
    assert.notStrictEqual(result, undefined);
    assert.deepStrictEqual(result.repository, mockRepository);
    assert.strictEqual(result.statistics, undefined);
    assert.strictEqual(result.refs, undefined);
  });

  void test('should include branch statistics when includeStatistics is true', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: mock.fn(() => ({
        getRepository: mock.fn(() => Promise.resolve(mockRepository)),
        getBranches: mock.fn(() => Promise.resolve(mockBranchStats)),
      })),
    };

    // Act
    const result = await getRepositoryDetails(mockConnection, {
      projectId: 'test-project',
      repositoryId: 'test-repo',
      includeStatistics: true,
    });

    // Assert
    assert.notStrictEqual(result, undefined);
    assert.deepStrictEqual(result.repository, mockRepository);
    assert.notStrictEqual(result.statistics, undefined);
    assert.deepStrictEqual(result.statistics?.branches, mockBranchStats);
    assert.strictEqual(result.refs, undefined);
  });

  void test('should include refs when includeRefs is true', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: mock.fn(() => ({
        getRepository: mock.fn(() => Promise.resolve(mockRepository)),
        getRefs: mock.fn(() => Promise.resolve(mockRefs)),
      })),
    };

    // Act
    const result = await getRepositoryDetails(mockConnection, {
      projectId: 'test-project',
      repositoryId: 'test-repo',
      includeRefs: true,
    });

    // Assert
    assert.notStrictEqual(result, undefined);
    assert.deepStrictEqual(result.repository, mockRepository);
    assert.strictEqual(result.statistics, undefined);
    assert.notStrictEqual(result.refs, undefined);
    assert.deepStrictEqual(result.refs?.value, mockRefs);
    assert.strictEqual(result.refs?.count, mockRefs.length);
  });

  void test('should include both statistics and refs when both options are true', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: mock.fn(() => ({
        getRepository: mock.fn(() => Promise.resolve(mockRepository)),
        getBranches: mock.fn(() => Promise.resolve(mockBranchStats)),
        getRefs: mock.fn(() => Promise.resolve(mockRefs)),
      })),
    };

    // Act
    const result = await getRepositoryDetails(mockConnection, {
      projectId: 'test-project',
      repositoryId: 'test-repo',
      includeStatistics: true,
      includeRefs: true,
    });

    // Assert
    assert.notStrictEqual(result, undefined);
    assert.deepStrictEqual(result.repository, mockRepository);
    assert.notStrictEqual(result.statistics, undefined);
    assert.deepStrictEqual(result.statistics?.branches, mockBranchStats);
    assert.notStrictEqual(result.refs, undefined);
    assert.deepStrictEqual(result.refs?.value, mockRefs);
    assert.strictEqual(result.refs?.count, mockRefs.length);
  });

  void test('should pass refFilter to getRefs when provided', async () => {
    // Arrange
    const getRefs = mock.fn((..._args: unknown[]) => Promise.resolve(mockRefs));
    const mockConnection: any = {
      getGitApi: mock.fn(() => ({
        getRepository: mock.fn(() => Promise.resolve(mockRepository)),
        getRefs,
      })),
    };

    // Act
    await getRepositoryDetails(mockConnection, {
      projectId: 'test-project',
      repositoryId: 'test-repo',
      includeRefs: true,
      refFilter: 'heads/',
    });

    // Assert
    assert.strictEqual(getRefs.mock.callCount(), 1);
    assert.deepStrictEqual(getRefs.mock.calls[0]?.arguments, [
      mockRepository.id,
      'test-project',
      'heads/',
    ]);
  });

  void test('should pass branchName to getBranches when provided', async () => {
    // Arrange
    const getBranches = mock.fn((..._args: unknown[]) =>
      Promise.resolve(mockBranchStats),
    );
    const mockConnection: any = {
      getGitApi: mock.fn(() => ({
        getRepository: mock.fn(() => Promise.resolve(mockRepository)),
        getBranches,
      })),
    };

    // Act
    await getRepositoryDetails(mockConnection, {
      projectId: 'test-project',
      repositoryId: 'test-repo',
      includeStatistics: true,
      branchName: 'main',
    });

    // Assert
    assert.strictEqual(getBranches.mock.callCount(), 1);
    assert.deepStrictEqual(getBranches.mock.calls[0]?.arguments, [
      mockRepository.id,
      'test-project',
      {
        version: 'main',
        versionType: GitVersionType.Branch,
      },
    ]);
  });

  void test('should propagate resource not found errors', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: mock.fn(() => ({
        getRepository: mock.fn(() => Promise.resolve(null)), // Simulate repository not found
      })),
    };

    // Act & Assert
    await assert.rejects(
      () =>
        getRepositoryDetails(mockConnection, {
          projectId: 'test-project',
          repositoryId: 'non-existent-repo',
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsResourceNotFoundError);
        assert.match(
          err.message,
          /Repository 'non-existent-repo' not found in project 'test-project'/,
        );
        return true;
      },
    );
  });

  void test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: mock.fn(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await assert.rejects(
      () =>
        getRepositoryDetails(mockConnection, {
          projectId: 'test-project',
          repositoryId: 'test-repo',
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsError);
        assert.match(err.message, /Custom error/);
        return true;
      },
    );
  });

  void test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: mock.fn(() => {
        throw new Error('Unexpected error');
      }),
    };

    // Act & Assert
    await assert.rejects(
      () =>
        getRepositoryDetails(mockConnection, {
          projectId: 'test-project',
          repositoryId: 'test-repo',
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(
          err.message,
          /Failed to get repository details: Unexpected error/,
        );
        return true;
      },
    );
  });

  void test('should handle null refs gracefully', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: mock.fn(() => ({
        getRepository: mock.fn(() => Promise.resolve(mockRepository)),
        getRefs: mock.fn(() => Promise.resolve(null)), // Simulate null refs
      })),
    };

    // Act
    const result = await getRepositoryDetails(mockConnection, {
      projectId: 'test-project',
      repositoryId: 'test-repo',
      includeRefs: true,
    });

    // Assert
    assert.notStrictEqual(result, undefined);
    assert.deepStrictEqual(result.repository, mockRepository);
    assert.notStrictEqual(result.refs, undefined);
    assert.deepStrictEqual(result.refs?.value, []);
    assert.strictEqual(result.refs?.count, 0);
  });
});

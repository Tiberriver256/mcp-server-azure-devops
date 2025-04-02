import { getRepositoryDetails } from './feature';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { GitRepository, GitBranchStats, GitRef } from '../types';

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('getRepositoryDetails unit', () => {
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

  test('should return basic repository information when no additional options are specified', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => ({
        getRepository: jest.fn().mockResolvedValue(mockRepository),
      })),
    };

    // Act
    const result = await getRepositoryDetails(mockConnection, {
      projectId: 'test-project',
      repositoryId: 'test-repo',
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.repository).toEqual(mockRepository);
    expect(result.statistics).toBeUndefined();
    expect(result.refs).toBeUndefined();
  });

  test('should include branch statistics when includeStatistics is true', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => ({
        getRepository: jest.fn().mockResolvedValue(mockRepository),
        getBranches: jest.fn().mockResolvedValue(mockBranchStats),
      })),
    };

    // Act
    const result = await getRepositoryDetails(mockConnection, {
      projectId: 'test-project',
      repositoryId: 'test-repo',
      includeStatistics: true,
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.repository).toEqual(mockRepository);
    expect(result.statistics).toBeDefined();
    expect(result.statistics?.branches).toEqual(mockBranchStats);
    expect(result.refs).toBeUndefined();
  });

  test('should include refs when includeRefs is true', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => ({
        getRepository: jest.fn().mockResolvedValue(mockRepository),
        getRefs: jest.fn().mockResolvedValue(mockRefs),
      })),
    };

    // Act
    const result = await getRepositoryDetails(mockConnection, {
      projectId: 'test-project',
      repositoryId: 'test-repo',
      includeRefs: true,
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.repository).toEqual(mockRepository);
    expect(result.statistics).toBeUndefined();
    expect(result.refs).toBeDefined();
    expect(result.refs?.value).toEqual(mockRefs);
    expect(result.refs?.count).toBe(mockRefs.length);
  });

  test('should include both statistics and refs when both options are true', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => ({
        getRepository: jest.fn().mockResolvedValue(mockRepository),
        getBranches: jest.fn().mockResolvedValue(mockBranchStats),
        getRefs: jest.fn().mockResolvedValue(mockRefs),
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
    expect(result).toBeDefined();
    expect(result.repository).toEqual(mockRepository);
    expect(result.statistics).toBeDefined();
    expect(result.statistics?.branches).toEqual(mockBranchStats);
    expect(result.refs).toBeDefined();
    expect(result.refs?.value).toEqual(mockRefs);
    expect(result.refs?.count).toBe(mockRefs.length);
  });

  test('should pass refFilter to getRefs when provided', async () => {
    // Arrange
    const getRefs = jest.fn().mockResolvedValue(mockRefs);
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => ({
        getRepository: jest.fn().mockResolvedValue(mockRepository),
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
    expect(getRefs).toHaveBeenCalledWith(
      mockRepository.id,
      'test-project',
      'heads/',
    );
  });

  test('should pass branchName to getBranches when provided', async () => {
    // Arrange
    const getBranches = jest.fn().mockResolvedValue(mockBranchStats);
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => ({
        getRepository: jest.fn().mockResolvedValue(mockRepository),
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
    expect(getBranches).toHaveBeenCalledWith(
      mockRepository.id,
      'test-project',
      {
        version: 'main',
        versionType: GitVersionType.Branch,
      },
    );
  });

  test('should propagate resource not found errors', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => ({
        getRepository: jest.fn().mockResolvedValue(null), // Simulate repository not found
      })),
    };

    // Act & Assert
    await expect(
      getRepositoryDetails(mockConnection, {
        projectId: 'test-project',
        repositoryId: 'non-existent-repo',
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);

    await expect(
      getRepositoryDetails(mockConnection, {
        projectId: 'test-project',
        repositoryId: 'non-existent-repo',
      }),
    ).rejects.toThrow(
      "Repository 'non-existent-repo' not found in project 'test-project'",
    );
  });

  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await expect(
      getRepositoryDetails(mockConnection, {
        projectId: 'test-project',
        repositoryId: 'test-repo',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      getRepositoryDetails(mockConnection, {
        projectId: 'test-project',
        repositoryId: 'test-repo',
      }),
    ).rejects.toThrow('Custom error');
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    // Act & Assert
    await expect(
      getRepositoryDetails(mockConnection, {
        projectId: 'test-project',
        repositoryId: 'test-repo',
      }),
    ).rejects.toThrow('Failed to get repository details: Unexpected error');
  });

  test('should handle null refs gracefully', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => ({
        getRepository: jest.fn().mockResolvedValue(mockRepository),
        getRefs: jest.fn().mockResolvedValue(null), // Simulate null refs
      })),
    };

    // Act
    const result = await getRepositoryDetails(mockConnection, {
      projectId: 'test-project',
      repositoryId: 'test-repo',
      includeRefs: true,
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.repository).toEqual(mockRepository);
    expect(result.refs).toBeDefined();
    expect(result.refs?.value).toEqual([]);
    expect(result.refs?.count).toBe(0);
  });
});

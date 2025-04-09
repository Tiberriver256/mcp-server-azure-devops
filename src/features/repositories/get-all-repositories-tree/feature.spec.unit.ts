import { WebApi } from 'azure-devops-node-api';
import {
  GitObjectType,
  VersionControlRecursionType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { getAllRepositoriesTree, formatRepositoryTree } from './feature';
import { RepositoryTreeItem } from '../types';

// Mock the Azure DevOps API
jest.mock('azure-devops-node-api');

describe('getAllRepositoriesTree', () => {
  // Sample repositories
  const mockRepos = [
    {
      id: 'repo1-id',
      name: 'repo1',
      defaultBranch: 'refs/heads/main',
    },
    {
      id: 'repo2-id',
      name: 'repo2',
      defaultBranch: 'refs/heads/master',
    },
    {
      id: 'repo3-id',
      name: 'repo3-api',
      defaultBranch: null, // No default branch
    },
  ];

  // Sample files/folders for repo1 at root level
  const mockRepo1RootItems = [
    {
      path: '/',
      gitObjectType: GitObjectType.Tree,
    },
    {
      path: '/README.md',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
    {
      path: '/src',
      isFolder: true,
      gitObjectType: GitObjectType.Tree,
    },
    {
      path: '/package.json',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
  ];

  // Sample files/folders for repo1 - src folder
  const mockRepo1SrcItems = [
    {
      path: '/src',
      isFolder: true,
      gitObjectType: GitObjectType.Tree,
    },
    {
      path: '/src/index.ts',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
    {
      path: '/src/utils',
      isFolder: true,
      gitObjectType: GitObjectType.Tree,
    },
  ];

  // Sample files/folders for repo1 with unlimited depth (what server would return for Full recursion)
  const mockRepo1FullRecursionItems = [
    {
      path: '/',
      gitObjectType: GitObjectType.Tree,
    },
    {
      path: '/README.md',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
    {
      path: '/src',
      isFolder: true,
      gitObjectType: GitObjectType.Tree,
    },
    {
      path: '/package.json',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
    {
      path: '/src/index.ts',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
    {
      path: '/src/utils',
      isFolder: true,
      gitObjectType: GitObjectType.Tree,
    },
    {
      path: '/src/utils/helper.ts',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
    {
      path: '/src/utils/constants.ts',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
  ];

  // Sample files/folders for repo2
  const mockRepo2RootItems = [
    {
      path: '/',
      gitObjectType: GitObjectType.Tree,
    },
    {
      path: '/README.md',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
    {
      path: '/data.json',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
  ];

  let mockConnection: jest.Mocked<WebApi>;
  let mockGitApi: any;

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();

    // Create mock GitApi
    mockGitApi = {
      getRepositories: jest.fn().mockResolvedValue(mockRepos),
      getItems: jest
        .fn()
        .mockImplementation((repoId, _projectId, path, recursionLevel) => {
          if (repoId === 'repo1-id') {
            if (recursionLevel === VersionControlRecursionType.Full) {
              return Promise.resolve(mockRepo1FullRecursionItems);
            } else if (path === '/') {
              return Promise.resolve(mockRepo1RootItems);
            } else if (path === '/src') {
              return Promise.resolve(mockRepo1SrcItems);
            }
          } else if (repoId === 'repo2-id') {
            if (recursionLevel === VersionControlRecursionType.Full) {
              return Promise.resolve(mockRepo2RootItems);
            } else if (path === '/') {
              return Promise.resolve(mockRepo2RootItems);
            }
          }
          return Promise.resolve([]);
        }),
    };

    // Create mock connection
    mockConnection = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    } as unknown as jest.Mocked<WebApi>;
  });

  it('should return tree structures for multiple repositories with limited depth', async () => {
    // Arrange
    const options = {
      organizationId: 'testOrg',
      projectId: 'testProject',
      depth: 2, // Limited depth
    };

    // Act
    const result = await getAllRepositoriesTree(mockConnection, options);

    // Assert
    expect(mockGitApi.getRepositories).toHaveBeenCalledWith('testProject');
    expect(result.repositories.length).toBe(3);

    // Verify repo1 tree
    const repo1 = result.repositories.find((r) => r.name === 'repo1');
    expect(repo1).toBeDefined();
    expect(repo1?.tree.length).toBeGreaterThan(0);
    expect(repo1?.stats.directories).toBeGreaterThan(0);
    expect(repo1?.stats.files).toBeGreaterThan(0);

    // Verify repo2 tree
    const repo2 = result.repositories.find((r) => r.name === 'repo2');
    expect(repo2).toBeDefined();
    expect(repo2?.tree.length).toBeGreaterThan(0);

    // Verify repo3 has error (no default branch)
    const repo3 = result.repositories.find((r) => r.name === 'repo3-api');
    expect(repo3).toBeDefined();
    expect(repo3?.error).toContain('No default branch found');

    // Verify recursion level was set correctly
    expect(mockGitApi.getItems).toHaveBeenCalledWith(
      'repo1-id',
      'testProject',
      '/',
      VersionControlRecursionType.OneLevel,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should return tree structures with max depth using Full recursion', async () => {
    // Arrange
    const options = {
      organizationId: 'testOrg',
      projectId: 'testProject',
      depth: 0, // Max depth
    };

    // Act
    const result = await getAllRepositoriesTree(mockConnection, options);

    // Assert
    expect(mockGitApi.getRepositories).toHaveBeenCalledWith('testProject');
    expect(result.repositories.length).toBe(3);

    // Verify repo1 tree
    const repo1 = result.repositories.find((r) => r.name === 'repo1');
    expect(repo1).toBeDefined();
    expect(repo1?.tree.length).toBeGreaterThan(0);
    // Should include all items, including nested ones
    expect(repo1?.tree.length).toBe(mockRepo1FullRecursionItems.length - 1); // -1 for root folder

    // Verify recursion level was set correctly
    expect(mockGitApi.getItems).toHaveBeenCalledWith(
      'repo1-id',
      'testProject',
      '/',
      VersionControlRecursionType.Full,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );

    // Verify all levels are represented
    if (repo1) {
      const level1Items = repo1.tree.filter((item) => item.level === 1);
      const level2Items = repo1.tree.filter((item) => item.level === 2);
      const level3Items = repo1.tree.filter((item) => item.level === 3);

      // Verify we have items at level 1
      expect(level1Items.length).toBeGreaterThan(0);

      // Verify we have items at level 2 (src/something)
      expect(level2Items.length).toBeGreaterThan(0);

      // Check for level 3 items if they exist in our mock data
      if (
        mockRepo1FullRecursionItems.some((item) => {
          const pathSegments = item.path.split('/').filter(Boolean);
          return pathSegments.length >= 3;
        })
      ) {
        expect(level3Items.length).toBeGreaterThan(0);
      }
    }
  });

  it('should filter repositories by pattern', async () => {
    // Arrange
    const options = {
      organizationId: 'testOrg',
      projectId: 'testProject',
      repositoryPattern: '*api*',
      depth: 1,
    };

    // Act
    const result = await getAllRepositoriesTree(mockConnection, options);

    // Assert
    expect(mockGitApi.getRepositories).toHaveBeenCalledWith('testProject');
    expect(result.repositories.length).toBe(1);
    expect(result.repositories[0].name).toBe('repo3-api');
  });

  it('should format repository tree correctly', () => {
    // Arrange
    const treeItems: RepositoryTreeItem[] = [
      { name: 'src', path: '/src', isFolder: true, level: 1 },
      { name: 'index.ts', path: '/src/index.ts', isFolder: false, level: 2 },
      { name: 'README.md', path: '/README.md', isFolder: false, level: 1 },
    ];
    const stats = { directories: 1, files: 2 };

    // Act
    const formatted = formatRepositoryTree('test-repo', treeItems, stats);

    // Assert
    expect(formatted).toMatchSnapshot();
  });

  it('should format complex repository tree structures correctly', () => {
    // Arrange
    const treeItems: RepositoryTreeItem[] = [
      // Root level files
      { name: 'README.md', path: '/README.md', isFolder: false, level: 1 },
      {
        name: 'package.json',
        path: '/package.json',
        isFolder: false,
        level: 1,
      },
      { name: '.gitignore', path: '/.gitignore', isFolder: false, level: 1 },

      // Multiple folders at root level
      { name: 'src', path: '/src', isFolder: true, level: 1 },
      { name: 'tests', path: '/tests', isFolder: true, level: 1 },
      { name: 'docs', path: '/docs', isFolder: true, level: 1 },

      // Nested src folder structure
      { name: 'components', path: '/src/components', isFolder: true, level: 2 },
      { name: 'utils', path: '/src/utils', isFolder: true, level: 2 },
      { name: 'index.ts', path: '/src/index.ts', isFolder: false, level: 2 },

      // Deeply nested components
      {
        name: 'Button',
        path: '/src/components/Button',
        isFolder: true,
        level: 3,
      },
      { name: 'Card', path: '/src/components/Card', isFolder: true, level: 3 },
      {
        name: 'Button.tsx',
        path: '/src/components/Button/Button.tsx',
        isFolder: false,
        level: 4,
      },
      {
        name: 'Button.styles.ts',
        path: '/src/components/Button/Button.styles.ts',
        isFolder: false,
        level: 4,
      },
      {
        name: 'Button.test.tsx',
        path: '/src/components/Button/Button.test.tsx',
        isFolder: false,
        level: 4,
      },
      {
        name: 'index.ts',
        path: '/src/components/Button/index.ts',
        isFolder: false,
        level: 4,
      },
      {
        name: 'Card.tsx',
        path: '/src/components/Card/Card.tsx',
        isFolder: false,
        level: 4,
      },

      // Utils with files
      {
        name: 'helpers.ts',
        path: '/src/utils/helpers.ts',
        isFolder: false,
        level: 3,
      },
      {
        name: 'constants.ts',
        path: '/src/utils/constants.ts',
        isFolder: false,
        level: 3,
      },

      // Empty folder
      { name: 'assets', path: '/src/assets', isFolder: true, level: 2 },

      // Files with special characters
      {
        name: 'file-with-dashes.js',
        path: '/src/file-with-dashes.js',
        isFolder: false,
        level: 2,
      },
      {
        name: 'file_with_underscores.js',
        path: '/src/file_with_underscores.js',
        isFolder: false,
        level: 2,
      },

      // Folders in test directory
      { name: 'unit', path: '/tests/unit', isFolder: true, level: 2 },
      {
        name: 'integration',
        path: '/tests/integration',
        isFolder: true,
        level: 2,
      },

      // Files in test directories
      { name: 'setup.js', path: '/tests/setup.js', isFolder: false, level: 2 },
      {
        name: 'example.test.js',
        path: '/tests/unit/example.test.js',
        isFolder: false,
        level: 3,
      },

      // Files in docs
      { name: 'API.md', path: '/docs/API.md', isFolder: false, level: 2 },
      {
        name: 'CONTRIBUTING.md',
        path: '/docs/CONTRIBUTING.md',
        isFolder: false,
        level: 2,
      },
    ];

    const stats = { directories: 10, files: 18 };

    // Act
    const formatted = formatRepositoryTree('complex-repo', treeItems, stats);

    // Assert
    expect(formatted).toMatchSnapshot();
  });

  it('should handle repository errors gracefully', async () => {
    // Arrange
    mockGitApi.getItems = jest.fn().mockRejectedValue(new Error('API error'));

    const options = {
      organizationId: 'testOrg',
      projectId: 'testProject',
      depth: 1,
    };

    // Act
    const result = await getAllRepositoriesTree(mockConnection, options);

    // Assert
    expect(result.repositories.length).toBe(3);
    const repo1 = result.repositories.find((r) => r.name === 'repo1');
    expect(repo1?.error).toBeDefined();
  });
});

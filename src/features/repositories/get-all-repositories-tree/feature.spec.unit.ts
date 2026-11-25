import type { WebApi } from 'azure-devops-node-api';
import {
  GitObjectType,
  VersionControlRecursionType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { getAllRepositoriesTree, formatRepositoryTree } from './feature';
import type { RepositoryTreeItem } from '../types';

describe('getAllRepositoriesTree', () => {
  const mockRepos = [
    { id: 'repo1-id', name: 'repo1', defaultBranch: 'refs/heads/main' },
    { id: 'repo2-id', name: 'repo2', defaultBranch: 'refs/heads/master' },
    { id: 'repo3-id', name: 'repo3-api', defaultBranch: null },
  ];

  const mockRepo1RootItems = [
    { path: '/', gitObjectType: GitObjectType.Tree },
    { path: '/README.md', isFolder: false, gitObjectType: GitObjectType.Blob },
    { path: '/src', isFolder: true, gitObjectType: GitObjectType.Tree },
    {
      path: '/package.json',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
  ];

  const mockRepo1SrcItems = [
    { path: '/src', isFolder: true, gitObjectType: GitObjectType.Tree },
    {
      path: '/src/index.ts',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
    { path: '/src/utils', isFolder: true, gitObjectType: GitObjectType.Tree },
  ];

  const mockRepo1FullItems = [
    ...mockRepo1RootItems,
    {
      path: '/src/index.ts',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
    { path: '/src/utils', isFolder: true, gitObjectType: GitObjectType.Tree },
    {
      path: '/src/utils/helper.ts',
      isFolder: false,
      gitObjectType: GitObjectType.Blob,
    },
  ];

  const mockRepo2RootItems = [
    { path: '/', gitObjectType: GitObjectType.Tree },
    { path: '/data.json', isFolder: false, gitObjectType: GitObjectType.Blob },
  ];

  let mockConnection: WebApi;
  let mockGitApi: { getRepositories: jest.Mock; getItems: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGitApi = {
      getRepositories: jest.fn().mockResolvedValue(mockRepos),
      getItems: jest
        .fn()
        .mockImplementation((repoId, _projectId, itemPath, recursionLevel) => {
          if (repoId === 'repo1-id') {
            if (recursionLevel === VersionControlRecursionType.Full) {
              return Promise.resolve(mockRepo1FullItems);
            }
            if (itemPath === '/') {
              return Promise.resolve(mockRepo1RootItems);
            }
            if (itemPath === '/src') {
              return Promise.resolve(mockRepo1SrcItems);
            }
          } else if (repoId === 'repo2-id') {
            return Promise.resolve(mockRepo2RootItems);
          }
          return Promise.resolve([]);
        }),
    };

    mockConnection = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    } as unknown as WebApi;
  });

  it('builds limited-depth trees using OneLevel recursion and records missing default branch errors', async () => {
    const result = await getAllRepositoriesTree(mockConnection, {
      organizationId: 'testOrg',
      projectId: 'testProject',
      depth: 2,
    });

    expect(mockGitApi.getRepositories).toHaveBeenCalledWith('testProject');
    expect(result.repositories).toHaveLength(3);

    const repo1 = result.repositories.find((r) => r.name === 'repo1');
    expect(repo1?.tree.map((i) => i.path)).toEqual([
      '/src',
      '/package.json',
      '/README.md',
      '/src/utils',
      '/src/index.ts',
    ]);
    expect(repo1?.stats).toEqual({ directories: 2, files: 3 });

    const repo3 = result.repositories.find((r) => r.name === 'repo3-api');
    expect(repo3?.error).toContain('No default branch found');

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

  it('uses Full recursion when depth is 0 and captures all nesting levels', async () => {
    const result = await getAllRepositoriesTree(mockConnection, {
      organizationId: 'testOrg',
      projectId: 'testProject',
      depth: 0,
    });

    const repo1 = result.repositories.find((r) => r.name === 'repo1');
    expect(repo1?.tree).toHaveLength(mockRepo1FullItems.length - 1);
    expect(repo1?.tree.some((item) => item.level === 3)).toBe(true);
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
  });

  it('filters repositories by positive and negated glob patterns', async () => {
    const matching = await getAllRepositoriesTree(mockConnection, {
      organizationId: 'testOrg',
      projectId: 'testProject',
      repositoryPattern: '*api*',
      depth: 1,
    });
    expect(matching.repositories.map((r) => r.name)).toEqual(['repo3-api']);

    const negated = await getAllRepositoriesTree(mockConnection, {
      organizationId: 'testOrg',
      projectId: 'testProject',
      repositoryPattern: '!*api*',
      depth: 1,
    });
    expect(negated.repositories.map((r) => r.name)).toEqual(['repo1', 'repo2']);
  });

  it('formats repository tree with folders before files and accurate summary counts', () => {
    const treeItems: RepositoryTreeItem[] = [
      { name: 'README.md', path: '/README.md', isFolder: false, level: 1 },
      { name: 'src', path: '/src', isFolder: true, level: 1 },
      { name: 'index.ts', path: '/src/index.ts', isFolder: false, level: 2 },
    ];
    const formatted = formatRepositoryTree('test-repo', treeItems, {
      directories: 1,
      files: 2,
    });

    expect(formatted).toBe(
      [
        'test-repo/',
        '  |-- src/',
        '  |   `-- index.ts',
        '  `-- README.md',
        '1 directories, 2 files',
        '',
      ].join('\n'),
    );
  });

  it('records per-repository API errors without failing the overall call', async () => {
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    try {
      mockGitApi.getItems.mockRejectedValue(new Error('API error'));

      const result = await getAllRepositoriesTree(mockConnection, {
        organizationId: 'testOrg',
        projectId: 'testProject',
        depth: 1,
      });

      expect(result.repositories).toHaveLength(3);
      expect(
        result.repositories.find((r) => r.name === 'repo1')?.error,
      ).toContain('API error');
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

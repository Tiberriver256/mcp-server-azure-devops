import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import {
  GitObjectType,
  VersionControlRecursionType,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { getAllRepositoriesTree, formatRepositoryTree } from './feature.ts';
import type { RepositoryTreeItem } from '../types.ts';

void describe('getAllRepositoriesTree', () => {
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
  let mockGitApi: {
    getRepositories: Mock<(projectId?: string) => Promise<typeof mockRepos>>;
    getItems: Mock<
      (
        repoId: string,
        projectId: string,
        itemPath: string,
        recursionLevel: VersionControlRecursionType,
        ...rest: unknown[]
      ) => Promise<unknown[]>
    >;
  };

  beforeEach(() => {
    mockGitApi = {
      getRepositories: mock.fn((_projectId?: string) =>
        Promise.resolve(mockRepos),
      ),
      getItems: mock.fn(
        (
          repoId: string,
          _projectId: string,
          itemPath: string,
          recursionLevel: VersionControlRecursionType,
          ..._rest: unknown[]
        ): Promise<unknown[]> => {
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
        },
      ),
    };

    mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    } as unknown as WebApi;
  });

  afterEach(() => {
    mock.restoreAll();
  });

  void it('builds limited-depth trees using OneLevel recursion and records missing default branch errors', async () => {
    const result = await getAllRepositoriesTree(mockConnection, {
      organizationId: 'testOrg',
      projectId: 'testProject',
      depth: 2,
    });

    assert.strictEqual(mockGitApi.getRepositories.mock.callCount(), 1);
    assert.deepStrictEqual(
      mockGitApi.getRepositories.mock.calls[0]?.arguments,
      ['testProject'],
    );
    assert.strictEqual(result.repositories.length, 3);

    const repo1 = result.repositories.find((r) => r.name === 'repo1');
    assert.deepStrictEqual(
      repo1?.tree.map((i) => i.path),
      ['/src', '/package.json', '/README.md', '/src/utils', '/src/index.ts'],
    );
    assert.deepStrictEqual(repo1?.stats, { directories: 2, files: 3 });

    const repo3 = result.repositories.find((r) => r.name === 'repo3-api');
    assert.ok(repo3?.error?.includes('No default branch found'));

    const repo1RootCall = mockGitApi.getItems.mock.calls.find(
      (call) =>
        call.arguments[0] === 'repo1-id' &&
        call.arguments[1] === 'testProject' &&
        call.arguments[2] === '/' &&
        call.arguments[3] === VersionControlRecursionType.OneLevel,
    );
    assert.ok(repo1RootCall);
    assert.strictEqual(repo1RootCall.arguments.length, 9);
    for (const arg of repo1RootCall.arguments.slice(4)) {
      assert.ok(arg !== null && arg !== undefined);
    }
  });

  void it('uses Full recursion when depth is 0 and captures all nesting levels', async () => {
    const result = await getAllRepositoriesTree(mockConnection, {
      organizationId: 'testOrg',
      projectId: 'testProject',
      depth: 0,
    });

    const repo1 = result.repositories.find((r) => r.name === 'repo1');
    assert.strictEqual(repo1?.tree.length, mockRepo1FullItems.length - 1);
    assert.strictEqual(
      repo1?.tree.some((item) => item.level === 3),
      true,
    );
    const repo1FullCall = mockGitApi.getItems.mock.calls.find(
      (call) =>
        call.arguments[0] === 'repo1-id' &&
        call.arguments[1] === 'testProject' &&
        call.arguments[2] === '/' &&
        call.arguments[3] === VersionControlRecursionType.Full,
    );
    assert.ok(repo1FullCall);
    assert.strictEqual(repo1FullCall.arguments.length, 9);
    for (const arg of repo1FullCall.arguments.slice(4)) {
      assert.ok(arg !== null && arg !== undefined);
    }
  });

  void it('filters repositories by positive and negated glob patterns', async () => {
    const matching = await getAllRepositoriesTree(mockConnection, {
      organizationId: 'testOrg',
      projectId: 'testProject',
      repositoryPattern: '*api*',
      depth: 1,
    });
    assert.deepStrictEqual(
      matching.repositories.map((r) => r.name),
      ['repo3-api'],
    );

    const negated = await getAllRepositoriesTree(mockConnection, {
      organizationId: 'testOrg',
      projectId: 'testProject',
      repositoryPattern: '!*api*',
      depth: 1,
    });
    assert.deepStrictEqual(
      negated.repositories.map((r) => r.name),
      ['repo1', 'repo2'],
    );
  });

  void it('formats repository tree with folders before files and accurate summary counts', () => {
    const treeItems: RepositoryTreeItem[] = [
      { name: 'README.md', path: '/README.md', isFolder: false, level: 1 },
      { name: 'src', path: '/src', isFolder: true, level: 1 },
      { name: 'index.ts', path: '/src/index.ts', isFolder: false, level: 2 },
    ];
    const formatted = formatRepositoryTree('test-repo', treeItems, {
      directories: 1,
      files: 2,
    });

    assert.strictEqual(
      formatted,
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

  void it('records per-repository API errors without failing the overall call', async () => {
    const stderrSpy = mock.method(process.stderr, 'write', () => true);
    try {
      mockGitApi.getItems.mock.mockImplementation(() =>
        Promise.reject(new Error('API error')),
      );

      const result = await getAllRepositoriesTree(mockConnection, {
        organizationId: 'testOrg',
        projectId: 'testProject',
        depth: 1,
      });

      assert.strictEqual(result.repositories.length, 3);
      assert.ok(
        result.repositories
          .find((r) => r.name === 'repo1')
          ?.error?.includes('API error'),
      );
    } finally {
      stderrSpy.mock.restore();
    }
  });
});

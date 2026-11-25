import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { getRepositoryTree } from './feature.ts';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';

void describe('getRepositoryTree unit', () => {
  void test('should build tree structure from root', async () => {
    const mockConnection: any = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getRepository: mock.fn(() =>
            Promise.resolve({
              id: '1',
              name: 'test-repo',
              defaultBranch: 'refs/heads/main',
            }),
          ),
          getItems: mock.fn(() =>
            Promise.resolve([
              { path: '/', isFolder: true },
              { path: '/README.md', isFolder: false },
              { path: '/src', isFolder: true },
              { path: '/src/index.ts', isFolder: false },
            ]),
          ),
        }),
      ),
    };

    const result = await getRepositoryTree(mockConnection, {
      projectId: 'proj',
      repositoryId: '1',
    });

    assert.strictEqual(result.name, 'test-repo');
    assert.strictEqual(result.stats.files, 2);
    assert.strictEqual(result.stats.directories, 1);
    assert.strictEqual(result.tree.length, 3);
  });

  void test('should respect depth when provided', async () => {
    const mockConnection: any = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getRepository: mock.fn(() =>
            Promise.resolve({
              id: '1',
              name: 'test-repo',
              defaultBranch: 'refs/heads/main',
            }),
          ),
          getItems: mock.fn(() =>
            Promise.resolve([
              { path: '/src', isFolder: true },
              { path: '/src/index.ts', isFolder: false },
              { path: '/src/utils', isFolder: true },
              { path: '/src/utils/helper.ts', isFolder: false },
            ]),
          ),
        }),
      ),
    };

    const result = await getRepositoryTree(mockConnection, {
      projectId: 'proj',
      repositoryId: '1',
      path: '/src',
      depth: 1,
    });

    assert.strictEqual(result.tree.length, 2);
    assert.strictEqual(result.stats.files, 1);
    assert.strictEqual(result.stats.directories, 1);
  });

  void test('should throw AzureDevOpsError when repository not found', async () => {
    const mockConnection: any = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getRepository: mock.fn(() => Promise.resolve(null)),
        }),
      ),
    };

    await assert.rejects(
      () =>
        getRepositoryTree(mockConnection, {
          projectId: 'p',
          repositoryId: 'missing',
        }),
      AzureDevOpsError,
    );
  });
});

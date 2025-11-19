import { getRepositoryTree } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

describe('getRepositoryTree unit', () => {
  test('should build tree structure from root', async () => {
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockResolvedValue({
          id: '1',
          name: 'test-repo',
          defaultBranch: 'refs/heads/main',
        }),
        getItems: jest.fn().mockResolvedValue([
          { path: '/', isFolder: true },
          { path: '/README.md', isFolder: false },
          { path: '/src', isFolder: true },
          { path: '/src/index.ts', isFolder: false },
        ]),
      }),
    };

    const result = await getRepositoryTree(mockConnection, {
      projectId: 'proj',
      repositoryId: '1',
    });

    expect(result.name).toBe('test-repo');
    expect(result.stats.files).toBe(2);
    expect(result.stats.directories).toBe(1);
    expect(result.tree.length).toBe(3);
  });

  test('should respect depth when provided', async () => {
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockResolvedValue({
          id: '1',
          name: 'test-repo',
          defaultBranch: 'refs/heads/main',
        }),
        getItems: jest.fn().mockResolvedValue([
          { path: '/src', isFolder: true },
          { path: '/src/index.ts', isFolder: false },
          { path: '/src/utils', isFolder: true },
          { path: '/src/utils/helper.ts', isFolder: false },
        ]),
      }),
    };

    const result = await getRepositoryTree(mockConnection, {
      projectId: 'proj',
      repositoryId: '1',
      path: '/src',
      depth: 1,
    });

    expect(result.tree).toHaveLength(2);
    expect(result.stats.files).toBe(1);
    expect(result.stats.directories).toBe(1);
  });

  test('should throw AzureDevOpsError when repository not found', async () => {
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockResolvedValue(null),
      }),
    };

    await expect(
      getRepositoryTree(mockConnection, {
        projectId: 'p',
        repositoryId: 'missing',
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });
});

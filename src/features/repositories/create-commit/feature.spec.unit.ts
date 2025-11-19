import { Readable } from 'stream';
import { createCommit } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';
import { createTwoFilesPatch } from 'diff';
import { VersionControlChangeType } from 'azure-devops-node-api/interfaces/GitInterfaces';

describe('createCommit unit', () => {
  test('should create push with provided changes', async () => {
    const createPush = jest.fn().mockResolvedValue({});
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        getBranch: jest
          .fn()
          .mockResolvedValue({ commit: { commitId: 'base' } }),
        getItemContent: jest
          .fn()
          .mockResolvedValue(Readable.from(['console.log("hello");\n'])),
        createPush,
      }),
    };

    await createCommit(mockConnection, {
      projectId: 'p',
      repositoryId: 'r',
      branchName: 'main',
      commitMessage: 'msg',
      changes: [
        {
          path: '/file.ts',
          patch: createTwoFilesPatch(
            '/file.ts',
            '/file.ts',
            'console.log("hello");\n',
            'console.log("world");\n',
          ),
        },
        {
          path: '/new.txt',
          patch: createTwoFilesPatch('/dev/null', '/new.txt', '', 'hi\n'),
        },
      ],
    });

    expect(createPush).toHaveBeenCalled();
    const payload = createPush.mock.calls[0][0];
    expect(payload.commits[0].changes).toHaveLength(2);
  });

  test('should throw when snippet not found', async () => {
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        getBranch: jest
          .fn()
          .mockResolvedValue({ commit: { commitId: 'base' } }),
        getItemContent: jest
          .fn()
          .mockResolvedValue(Readable.from(['nothing here'])),
      }),
    };

    await expect(
      createCommit(mockConnection, {
        projectId: 'p',
        repositoryId: 'r',
        branchName: 'main',
        commitMessage: 'msg',
        changes: [
          {
            path: '/file.ts',
            patch: createTwoFilesPatch(
              '/file.ts',
              '/file.ts',
              'console.log("hello");\n',
              'console.log("world");\n',
            ),
          },
        ],
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });

  test('should create delete change when patch removes a file', async () => {
    const createPush = jest.fn().mockResolvedValue({});
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        getBranch: jest
          .fn()
          .mockResolvedValue({ commit: { commitId: 'base' } }),
        getItemContent: jest
          .fn()
          .mockResolvedValue(Readable.from(['goodbye\n'])),
        createPush,
      }),
    };

    await createCommit(mockConnection, {
      projectId: 'p',
      repositoryId: 'r',
      branchName: 'main',
      commitMessage: 'msg',
      changes: [
        {
          patch: createTwoFilesPatch('/old.txt', '/dev/null', 'goodbye\n', ''),
        },
      ],
    });

    expect(createPush).toHaveBeenCalled();
    const payload = createPush.mock.calls[0][0];
    const change = payload.commits[0].changes[0];
    expect(change.changeType).toBe(VersionControlChangeType.Delete);
    expect(change.item).toEqual({ path: '/old.txt' });
    expect(change.newContent).toBeUndefined();
  });

  test('should handle search/replace format', async () => {
    const createPush = jest.fn().mockResolvedValue({});
    const fileContent = 'const x = 1;\nconsole.log("hello");\n';
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        getBranch: jest
          .fn()
          .mockResolvedValue({ commit: { commitId: 'base' } }),
        getItemContent: jest
          .fn()
          .mockImplementation(() => Readable.from([fileContent])),
        createPush,
      }),
    };

    await createCommit(mockConnection, {
      projectId: 'p',
      repositoryId: 'r',
      branchName: 'main',
      commitMessage: 'msg',
      changes: [
        {
          path: '/file.ts',
          search: 'console.log("hello");',
          replace: 'console.log("world");',
        },
      ],
    });

    expect(createPush).toHaveBeenCalled();
    const payload = createPush.mock.calls[0][0];
    expect(payload.commits[0].changes).toHaveLength(1);
    const change = payload.commits[0].changes[0];
    expect(change.changeType).toBe(VersionControlChangeType.Edit);
    expect(change.newContent?.content).toContain('console.log("world");');
  });

  test('should throw when search string not found', async () => {
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        getBranch: jest
          .fn()
          .mockResolvedValue({ commit: { commitId: 'base' } }),
        getItemContent: jest
          .fn()
          .mockResolvedValue(Readable.from(['const x = 1;\n'])),
      }),
    };

    await expect(
      createCommit(mockConnection, {
        projectId: 'p',
        repositoryId: 'r',
        branchName: 'main',
        commitMessage: 'msg',
        changes: [
          {
            path: '/file.ts',
            search: 'NOT_FOUND',
            replace: 'something',
          },
        ],
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });
});

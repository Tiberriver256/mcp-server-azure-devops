import { Readable } from 'stream';
import type { WebApi } from 'azure-devops-node-api';
import { createTwoFilesPatch } from 'diff';
import { VersionControlChangeType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  applyLiteralSearchReplace,
  createCommit,
  normalizeGitDiffPath,
} from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

describe('createCommit unit', () => {
  test('creates push with Edit and Add changes from unified patches', async () => {
    const createPush = jest.fn().mockResolvedValue({});
    const mockConnection = {
      getGitApi: jest.fn().mockResolvedValue({
        getBranch: jest
          .fn()
          .mockResolvedValue({ commit: { commitId: 'base' } }),
        getItemContent: jest
          .fn()
          .mockResolvedValue(Readable.from(['console.log("hello");\n'])),
        createPush,
      }),
    } as unknown as WebApi;

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

    const payload = createPush.mock.calls[0][0];
    expect(payload.commits[0].changes).toHaveLength(2);
    expect(payload.commits[0].changes[0].changeType).toBe(
      VersionControlChangeType.Edit,
    );
    expect(payload.commits[0].changes[1].changeType).toBe(
      VersionControlChangeType.Add,
    );
  });

  test('creates Delete change when patch removes a file', async () => {
    const createPush = jest.fn().mockResolvedValue({});
    const mockConnection = {
      getGitApi: jest.fn().mockResolvedValue({
        getBranch: jest
          .fn()
          .mockResolvedValue({ commit: { commitId: 'base' } }),
        getItemContent: jest
          .fn()
          .mockResolvedValue(Readable.from(['goodbye\n'])),
        createPush,
      }),
    } as unknown as WebApi;

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

    const change = createPush.mock.calls[0][0].commits[0].changes[0];
    expect(change.changeType).toBe(VersionControlChangeType.Delete);
    expect(change.item).toEqual({ path: '/old.txt' });
    expect(change.newContent).toBeUndefined();
  });

  test('uses single-fetch fast path for search/replace and treats replacement literally', async () => {
    const createPush = jest.fn().mockResolvedValue({});
    const getItemContent = jest
      .fn()
      .mockImplementation(() =>
        Readable.from(['const price = "OLD";\nconsole.log(price);\n']),
      );
    const mockConnection = {
      getGitApi: jest.fn().mockResolvedValue({
        getBranch: jest
          .fn()
          .mockResolvedValue({ commit: { commitId: 'base' } }),
        getItemContent,
        createPush,
      }),
    } as unknown as WebApi;

    await createCommit(mockConnection, {
      projectId: 'p',
      repositoryId: 'r',
      branchName: 'main',
      commitMessage: 'msg',
      changes: [
        {
          path: '/file.ts',
          search: '"OLD"',
          replace: '"$& $$ $1"',
        },
      ],
    });

    // Fast path must fetch file content only once (not twice via diff round-trip)
    expect(getItemContent).toHaveBeenCalledTimes(1);
    const change = createPush.mock.calls[0][0].commits[0].changes[0];
    expect(change.changeType).toBe(VersionControlChangeType.Edit);
    expect(change.newContent?.content).toBe(
      'const price = "$& $$ $1";\nconsole.log(price);\n',
    );
  });

  test('throws when patch or search snippet does not match', async () => {
    const mockConnection = {
      getGitApi: jest.fn().mockResolvedValue({
        getBranch: jest
          .fn()
          .mockResolvedValue({ commit: { commitId: 'base' } }),
        getItemContent: jest
          .fn()
          .mockImplementation(() => Readable.from(['const x = 1;\n'])),
      }),
    } as unknown as WebApi;

    await expect(
      createCommit(mockConnection, {
        projectId: 'p',
        repositoryId: 'r',
        branchName: 'main',
        commitMessage: 'msg',
        changes: [{ path: '/file.ts', search: 'MISSING', replace: 'x' }],
      }),
    ).rejects.toThrow(AzureDevOpsError);

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
              'nope\n',
              'yes\n',
            ),
          },
        ],
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });

  test('normalizeGitDiffPath strips only a single git a/ or b/ prefix and preserves nested a/b/ dirs', () => {
    expect(normalizeGitDiffPath('a/src/app.ts')).toBe('src/app.ts');
    expect(normalizeGitDiffPath('b/a/b/file.ts')).toBe('a/b/file.ts');
    expect(normalizeGitDiffPath('/a/b/file.ts')).toBe('/a/b/file.ts');
    expect(
      applyLiteralSearchReplace('hello world', 'world', '$&!', '/file.ts'),
    ).toBe('hello $&!');
  });
});

import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { Readable } from 'stream';
import type { WebApi } from 'azure-devops-node-api';
import { createTwoFilesPatch } from 'diff';
import { VersionControlChangeType } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  applyLiteralSearchReplace,
  createCommit,
  normalizeGitDiffPath,
} from './feature.ts';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';

void describe('createCommit unit', () => {
  void test('creates push with Edit and Add changes from unified patches', async () => {
    const createPush = mock.fn((..._args: any[]) => Promise.resolve({}));
    const mockConnection = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getBranch: mock.fn(() =>
            Promise.resolve({ commit: { commitId: 'base' } }),
          ),
          getItemContent: mock.fn(() =>
            Promise.resolve(Readable.from(['console.log("hello");\n'])),
          ),
          createPush,
        }),
      ),
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

    const payload = createPush.mock.calls[0]?.arguments[0];
    assert.strictEqual(payload.commits[0].changes.length, 2);
    assert.strictEqual(
      payload.commits[0].changes[0].changeType,
      VersionControlChangeType.Edit,
    );
    assert.strictEqual(
      payload.commits[0].changes[1].changeType,
      VersionControlChangeType.Add,
    );
  });

  void test('creates Delete change when patch removes a file', async () => {
    const createPush = mock.fn((..._args: any[]) => Promise.resolve({}));
    const mockConnection = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getBranch: mock.fn(() =>
            Promise.resolve({ commit: { commitId: 'base' } }),
          ),
          getItemContent: mock.fn(() =>
            Promise.resolve(Readable.from(['goodbye\n'])),
          ),
          createPush,
        }),
      ),
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

    const change = createPush.mock.calls[0]?.arguments[0].commits[0].changes[0];
    assert.strictEqual(change.changeType, VersionControlChangeType.Delete);
    assert.deepStrictEqual(change.item, { path: '/old.txt' });
    assert.strictEqual(change.newContent, undefined);
  });

  void test('uses single-fetch fast path for search/replace and treats replacement literally', async () => {
    const createPush = mock.fn((..._args: any[]) => Promise.resolve({}));
    const getItemContent = mock.fn(() =>
      Readable.from(['const price = "OLD";\nconsole.log(price);\n']),
    );
    const mockConnection = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getBranch: mock.fn(() =>
            Promise.resolve({ commit: { commitId: 'base' } }),
          ),
          getItemContent,
          createPush,
        }),
      ),
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
    assert.strictEqual(getItemContent.mock.callCount(), 1);
    const change = createPush.mock.calls[0]?.arguments[0].commits[0].changes[0];
    assert.strictEqual(change.changeType, VersionControlChangeType.Edit);
    assert.strictEqual(
      change.newContent?.content,
      'const price = "$& $$ $1";\nconsole.log(price);\n',
    );
  });

  void test('throws when patch or search snippet does not match', async () => {
    const mockConnection = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getBranch: mock.fn(() =>
            Promise.resolve({ commit: { commitId: 'base' } }),
          ),
          getItemContent: mock.fn(() => Readable.from(['const x = 1;\n'])),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        createCommit(mockConnection, {
          projectId: 'p',
          repositoryId: 'r',
          branchName: 'main',
          commitMessage: 'msg',
          changes: [{ path: '/file.ts', search: 'MISSING', replace: 'x' }],
        }),
      AzureDevOpsError,
    );

    await assert.rejects(
      () =>
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
      AzureDevOpsError,
    );
  });

  void test('normalizeGitDiffPath strips only a single git a/ or b/ prefix and preserves nested a/b/ dirs', () => {
    assert.strictEqual(normalizeGitDiffPath('a/src/app.ts'), 'src/app.ts');
    assert.strictEqual(normalizeGitDiffPath('b/a/b/file.ts'), 'a/b/file.ts');
    assert.strictEqual(normalizeGitDiffPath('/a/b/file.ts'), '/a/b/file.ts');
    assert.strictEqual(
      applyLiteralSearchReplace('hello world', 'world', '$&!', '/file.ts'),
      'hello $&!',
    );
  });
});

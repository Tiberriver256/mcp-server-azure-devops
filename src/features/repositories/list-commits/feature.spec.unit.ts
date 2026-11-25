import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Readable } from 'stream';
import { listCommits } from './feature.ts';

void describe('listCommits', () => {
  void it('should return commits with file patches', async () => {
    const mockCommits = [
      {
        commitId: '123',
        comment: 'Initial commit',
        author: { name: 'Author' },
        committer: { name: 'Committer' },
        url: 'https://example.com',
        parents: ['abc'],
      },
    ];

    const getCommits = mock.fn((..._args: unknown[]) =>
      Promise.resolve(mockCommits),
    );
    const getChanges = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        changes: [
          {
            item: {
              path: '/file.ts',
              objectId: 'new',
              originalObjectId: 'old',
            },
            originalPath: '/file.ts',
          },
        ],
      }),
    );
    const getBlobContent = mock.fn((_repo: string, objectId: string) => {
      const content =
        objectId === 'old' ? 'console.log("old");\n' : 'console.log("new");\n';
      return Readable.from([content]);
    });

    const mockConnection: any = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getCommits,
          getChanges,
          getBlobContent,
        }),
      ),
    };

    const result = await listCommits(mockConnection, {
      projectId: 'p',
      repositoryId: 'r',
      branchName: 'main',
    });

    assert.strictEqual(result.commits.length, 1);
    assert.strictEqual(result.commits[0].files.length, 1);
    assert.ok(
      result.commits[0].files[0].patch.includes('-console.log("old");'),
    );
    assert.ok(
      result.commits[0].files[0].patch.includes('+console.log("new");'),
    );
    assert.strictEqual(getCommits.mock.callCount(), 1);
    assert.strictEqual(getChanges.mock.callCount(), 1);
    assert.deepStrictEqual(getChanges.mock.calls[0]?.arguments, [
      '123',
      'r',
      'p',
    ]);
  });
});

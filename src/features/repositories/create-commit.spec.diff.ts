import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Readable } from 'stream';
import fc from 'fast-check';
import { createTwoFilesPatch } from 'diff';
import type { WebApi } from 'azure-devops-node-api';
import { createCommit } from './create-commit/feature.ts';

const lineArb = fc.stringMatching(/^[a-zA-Z0-9 _.,:;()=+\-*/'"$]{1,40}$/);

void describe('createCommit differential test: search/replace fast path vs unified-patch path', () => {
  void it('produces identical GitChange payloads between search/replace fast path and createTwoFilesPatch patch path', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(lineArb, { minLength: 1, maxLength: 6 }),
        lineArb,
        lineArb,
        fc.array(lineArb, { minLength: 1, maxLength: 6 }),
        async (beforeLines, targetLine, replacementLine, afterLines) => {
          // Ensure targetLine is not a substring of any earlier line so both modes target the exact same line
          fc.pre(
            !beforeLines.some((line) => line.includes(targetLine)) &&
              !afterLines.includes(targetLine) &&
              targetLine !== replacementLine,
          );

          const originalContent = `${[...beforeLines, targetLine, ...afterLines].join('\n')}\n`;
          const expectedNewContent = `${[...beforeLines, replacementLine, ...afterLines].join('\n')}\n`;

          const runCommit = async (
            changes: Parameters<typeof createCommit>[1]['changes'],
          ) => {
            let pushed: unknown;
            const getItemContent = mock.fn(() =>
              Readable.from([originalContent]),
            );
            const mockConn = {
              getGitApi: mock.fn(() =>
                Promise.resolve({
                  getBranch: mock.fn(() =>
                    Promise.resolve({ commit: { commitId: 'base-sha' } }),
                  ),
                  getItemContent,
                  createPush: mock.fn((payload: unknown) => {
                    pushed = payload;
                    return Promise.resolve({});
                  }),
                }),
              ),
            } as unknown as WebApi;

            await createCommit(mockConn, {
              projectId: 'proj',
              repositoryId: 'repo',
              branchName: 'main',
              commitMessage: 'diff check',
              changes,
            });
            return { pushed, fetchCount: getItemContent.mock.callCount() };
          };

          // Path A: fast-path literal search/replace
          const fastPath = await runCommit([
            {
              path: '/src/sample.ts',
              search: targetLine,
              replace: replacementLine,
            },
          ]);

          // Path B: unified diff patch oracle
          const patch = createTwoFilesPatch(
            '/src/sample.ts',
            '/src/sample.ts',
            originalContent,
            expectedNewContent,
          );
          const patchPath = await runCommit([
            {
              path: '/src/sample.ts',
              patch,
            },
          ]);

          // Both paths must emit byte-for-byte identical push payloads
          assert.deepStrictEqual(fastPath.pushed, patchPath.pushed);
          // Fast path must also strictly do only 1 fetch
          assert.strictEqual(fastPath.fetchCount, 1);
        },
      ),
      { numRuns: 60 },
    );
  });
});

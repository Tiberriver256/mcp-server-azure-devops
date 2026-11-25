import { Readable } from 'stream';
import fc from 'fast-check';
import { createTwoFilesPatch } from 'diff';
import type { WebApi } from 'azure-devops-node-api';
import { createCommit } from './create-commit/feature';

const lineArb = fc.stringMatching(/^[a-zA-Z0-9 _.,:;()=+\-*/'"$]{1,40}$/);

describe('createCommit differential test: search/replace fast path vs unified-patch path', () => {
  it('produces identical GitChange payloads between search/replace fast path and createTwoFilesPatch patch path', async () => {
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
            const getItemContent = jest
              .fn()
              .mockImplementation(() => Readable.from([originalContent]));
            const mockConn = {
              getGitApi: jest.fn().mockResolvedValue({
                getBranch: jest
                  .fn()
                  .mockResolvedValue({ commit: { commitId: 'base-sha' } }),
                getItemContent,
                createPush: jest.fn().mockImplementation(async (payload) => {
                  pushed = payload;
                  return {};
                }),
              }),
            } as unknown as WebApi;

            await createCommit(mockConn, {
              projectId: 'proj',
              repositoryId: 'repo',
              branchName: 'main',
              commitMessage: 'diff check',
              changes,
            });
            return { pushed, fetchCount: getItemContent.mock.calls.length };
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
          expect(fastPath.pushed).toEqual(patchPath.pushed);
          // Fast path must also strictly do only 1 fetch
          expect(fastPath.fetchCount).toBe(1);
        },
      ),
      { numRuns: 60 },
    );
  });
});

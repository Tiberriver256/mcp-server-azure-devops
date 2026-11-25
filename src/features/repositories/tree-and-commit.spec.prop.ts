import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { formatRepositoryTree } from './get-all-repositories-tree/feature.ts';
import {
  applyLiteralSearchReplace,
  normalizeGitDiffPath,
} from './create-commit/feature.ts';
import type { RepositoryTreeItem } from './types.ts';

const segArb = fc.stringMatching(/^[a-zA-Z0-9._-]{1,12}$/);

const treeItemsArb = fc
  .uniqueArray(
    fc.record({
      dir: fc.option(segArb, { nil: undefined }),
      name: segArb,
      isFolder: fc.boolean(),
    }),
    {
      selector: (item) =>
        item.dir ? `/${item.dir}/${item.name}` : `/${item.name}`,
      minLength: 1,
      maxLength: 12,
    },
  )
  .map((rawItems): RepositoryTreeItem[] => {
    const items = new Map<string, RepositoryTreeItem>();
    for (const item of rawItems) {
      if (item.dir) {
        const dirPath = `/${item.dir}`;
        if (!items.has(dirPath)) {
          items.set(dirPath, {
            name: item.dir,
            path: dirPath,
            isFolder: true,
            level: 1,
          });
        }
        const childPath = `/${item.dir}/${item.name}`;
        items.set(childPath, {
          name: item.name,
          path: childPath,
          isFolder: item.isFolder,
          level: 2,
        });
      } else {
        const p = `/${item.name}`;
        if (!items.has(p)) {
          items.set(p, {
            name: item.name,
            path: p,
            isFolder: item.isFolder,
            level: 1,
          });
        }
      }
    }
    return Array.from(items.values());
  });

void describe('repositories tree & commit properties', () => {
  void it('formatRepositoryTree is permutation-invariant on input order and emits exact item lines and summary counts', () => {
    fc.assert(
      fc.property(segArb, treeItemsArb, (repoName, items) => {
        const stats = {
          directories: items.filter((i) => i.isFolder).length,
          files: items.filter((i) => !i.isFolder).length,
        };

        const reversed = [...items].reverse();
        const outA = formatRepositoryTree(repoName, items, stats);
        const outB = formatRepositoryTree(repoName, reversed, stats);

        // Permutation invariance replaces brittle snapshot tests
        assert.strictEqual(outA, outB);

        const lines = outA.trimEnd().split('\n');
        assert.strictEqual(lines[0], `${repoName}/`);
        assert.strictEqual(
          lines[lines.length - 1],
          `${stats.directories} directories, ${stats.files} files`,
        );
        // Header + one line per tree item + summary footer
        assert.strictEqual(lines.length, items.length + 2);
      }),
      { numRuns: 100 },
    );
  });

  void it("applyLiteralSearchReplace treats replacement literally even with $&, $$, $`, $' metacharacters", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 15 }),
        fc.string({ maxLength: 30 }),
        fc.oneof(
          fc.string({ maxLength: 30 }),
          fc.constantFrom('$&', '$$', "$'", '$`', '$1$2$$$&'),
        ),
        (prefix, target, suffix, replacement) => {
          // Ensure prefix doesn't already contain target so first match is strictly at prefix.length
          fc.pre(!prefix.includes(target));
          const original = prefix + target + suffix;
          const updated = applyLiteralSearchReplace(
            original,
            target,
            replacement,
            '/test.ts',
          );
          assert.strictEqual(updated, prefix + replacement + suffix);
          assert.strictEqual(
            updated.length,
            original.length - target.length + replacement.length,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  void it('normalizeGitDiffPath strips at most one leading git a/ or b/ prefix and preserves nested a/ or b/ directories', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('a/', 'b/'),
        fc.array(fc.oneof(segArb, fc.constantFrom('a', 'b')), {
          minLength: 1,
          maxLength: 4,
        }),
        (gitPrefix, pathParts) => {
          const innerPath = pathParts.join('/');
          assert.strictEqual(
            normalizeGitDiffPath(`${gitPrefix}${innerPath}`),
            innerPath,
          );
          // Absolute paths starting with / are never stripped
          assert.strictEqual(
            normalizeGitDiffPath(`/${innerPath}`),
            `/${innerPath}`,
          );
        },
      ),
      { numRuns: 150 },
    );
  });
});

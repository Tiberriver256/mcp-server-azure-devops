import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { coercePipelineId } from './helpers.ts';
import { parsePipelineName } from './run-reference.ts';
import { normalizeBranch } from './list-pipeline-runs/feature.ts';
import { makeRelativePath } from './artifacts.ts';
import {
  buildContainerPathCandidates,
  normalizeArtifactPath,
} from './download-pipeline-artifact/feature.ts';

const segmentArb = fc.stringMatching(/^[a-zA-Z0-9._-]{1,14}$/);

void describe('pipelines helpers properties', () => {
  void it('parsePipelineName treats forward slashes and backslashes identically and prefixes folders with \\', () => {
    fc.assert(
      fc.property(
        fc.array(segmentArb, { minLength: 1, maxLength: 4 }),
        fc.boolean(),
        (segments, leadingSep) => {
          const prefix = leadingSep ? '/' : '';
          const fwd = `${prefix}${segments.join('/')}`;
          const back = `${leadingSep ? '\\' : ''}${segments.join('\\')}`;

          const fromFwd = parsePipelineName(fwd);
          const fromBack = parsePipelineName(back);
          assert.deepStrictEqual(fromFwd, fromBack);
          assert.strictEqual(fromFwd.name, segments[segments.length - 1]);
          if (segments.length > 1) {
            assert.strictEqual(
              fromFwd.folder,
              `\\${segments.slice(0, -1).join('\\')}`,
            );
          } else if (leadingSep) {
            assert.strictEqual(fromFwd.folder, '\\');
          } else {
            assert.strictEqual(fromFwd.folder, undefined);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  void it('normalizeBranch is idempotent, returns undefined for whitespace-only inputs, and always starts with refs/', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (raw) => {
        const once = normalizeBranch(raw);
        if (raw.trim().length === 0) {
          assert.strictEqual(once, undefined);
        } else {
          assert.strictEqual(once?.startsWith('refs/'), true);
          assert.strictEqual(normalizeBranch(once), once);
        }
      }),
      { numRuns: 150 },
    );
  });

  void it('coercePipelineId accepts only positive safe integers (or pure decimal strings) and rejects trailing garbage / non-integers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000_000 }), (n) => {
        assert.strictEqual(coercePipelineId(n), n);
        assert.strictEqual(coercePipelineId(`  ${n}  `), n);
      }),
      { numRuns: 100 },
    );

    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ max: 0 }),
          fc.double({ noInteger: true }),
          fc.constantFrom(
            Number.NaN,
            Infinity,
            -Infinity,
            '',
            '   ',
            null,
            undefined,
            true,
            false,
          ),
          fc
            .tuple(
              fc.integer({ min: 1, max: 9999 }),
              fc.stringMatching(/^[a-zA-Z_-]{1,5}$/),
            )
            .map(([n, junk]) => `${n}${junk}`),
        ),
        (bad) => {
          assert.strictEqual(coercePipelineId(bad), undefined);
        },
      ),
      { numRuns: 150 },
    );
  });

  void it('makeRelativePath strips longest matching prefix cleanly and never leaves leading slashes', () => {
    fc.assert(
      fc.property(
        segmentArb,
        fc.array(segmentArb, { minLength: 1, maxLength: 3 }),
        (root, rest) => {
          const full = `${root}/${rest.join('/')}`;
          const rel = makeRelativePath(full, [root]);
          assert.strictEqual(rel, rest.join('/'));
          assert.strictEqual(rel.startsWith('/'), false);
          // Backslash variant matches identically
          assert.strictEqual(
            makeRelativePath(full.replace(/\//g, '\\'), [root]),
            rel,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  void it('normalizeArtifactPath & buildContainerPathCandidates normalize separators and produce deduplicated non-empty candidates', () => {
    fc.assert(
      fc.property(
        segmentArb,
        fc.array(segmentArb, { minLength: 1, maxLength: 3 }),
        fc.option(segmentArb, { nil: undefined }),
        (artifact, fileParts, rootPath) => {
          const raw = `/${artifact}\\${fileParts.join('\\')}/`;
          const parsed = normalizeArtifactPath(raw);
          assert.strictEqual(parsed.artifactName, artifact);
          assert.strictEqual(parsed.relativePath, fileParts.join('/'));

          const candidates = buildContainerPathCandidates(
            parsed.artifactName,
            rootPath,
            parsed.relativePath,
          );
          assert.ok(candidates.length > 0);
          const candidateSet = new Set(candidates);
          assert.strictEqual(candidateSet.size, candidates.length);
          assert.ok(candidateSet.has(parsed.relativePath));
          assert.ok(candidateSet.has(`${artifact}/${parsed.relativePath}`));
        },
      ),
      { numRuns: 100 },
    );
  });
});

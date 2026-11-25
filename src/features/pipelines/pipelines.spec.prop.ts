import fc from 'fast-check';
import { coercePipelineId } from './helpers';
import { parsePipelineName } from './run-reference';
import { normalizeBranch } from './list-pipeline-runs/feature';
import { makeRelativePath } from './artifacts';
import {
  buildContainerPathCandidates,
  normalizeArtifactPath,
} from './download-pipeline-artifact/feature';

const segmentArb = fc.stringMatching(/^[a-zA-Z0-9._-]{1,14}$/);

describe('pipelines helpers properties', () => {
  it('parsePipelineName treats forward slashes and backslashes identically and prefixes folders with \\', () => {
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
          expect(fromFwd).toEqual(fromBack);
          expect(fromFwd.name).toBe(segments[segments.length - 1]);
          if (segments.length > 1) {
            expect(fromFwd.folder).toBe(
              `\\${segments.slice(0, -1).join('\\')}`,
            );
          } else if (leadingSep) {
            expect(fromFwd.folder).toBe('\\');
          } else {
            expect(fromFwd.folder).toBeUndefined();
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('normalizeBranch is idempotent, returns undefined for whitespace-only inputs, and always starts with refs/', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (raw) => {
        const once = normalizeBranch(raw);
        if (raw.trim().length === 0) {
          expect(once).toBeUndefined();
        } else {
          expect(once?.startsWith('refs/')).toBe(true);
          expect(normalizeBranch(once)).toBe(once);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('coercePipelineId accepts only positive safe integers (or pure decimal strings) and rejects trailing garbage / non-integers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000_000 }), (n) => {
        expect(coercePipelineId(n)).toBe(n);
        expect(coercePipelineId(`  ${n}  `)).toBe(n);
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
          expect(coercePipelineId(bad)).toBeUndefined();
        },
      ),
      { numRuns: 150 },
    );
  });

  it('makeRelativePath strips longest matching prefix cleanly and never leaves leading slashes', () => {
    fc.assert(
      fc.property(
        segmentArb,
        fc.array(segmentArb, { minLength: 1, maxLength: 3 }),
        (root, rest) => {
          const full = `${root}/${rest.join('/')}`;
          const rel = makeRelativePath(full, [root]);
          expect(rel).toBe(rest.join('/'));
          expect(rel.startsWith('/')).toBe(false);
          // Backslash variant matches identically
          expect(makeRelativePath(full.replace(/\//g, '\\'), [root])).toBe(rel);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('normalizeArtifactPath & buildContainerPathCandidates normalize separators and produce deduplicated non-empty candidates', () => {
    fc.assert(
      fc.property(
        segmentArb,
        fc.array(segmentArb, { minLength: 1, maxLength: 3 }),
        fc.option(segmentArb, { nil: undefined }),
        (artifact, fileParts, rootPath) => {
          const raw = `/${artifact}\\${fileParts.join('\\')}/`;
          const parsed = normalizeArtifactPath(raw);
          expect(parsed.artifactName).toBe(artifact);
          expect(parsed.relativePath).toBe(fileParts.join('/'));

          const candidates = buildContainerPathCandidates(
            parsed.artifactName,
            rootPath,
            parsed.relativePath,
          );
          expect(candidates.length).toBeGreaterThan(0);
          expect(new Set(candidates).size).toBe(candidates.length);
          expect(candidates).toContain(parsed.relativePath);
          expect(candidates).toContain(`${artifact}/${parsed.relativePath}`);
        },
      ),
      { numRuns: 100 },
    );
  });
});

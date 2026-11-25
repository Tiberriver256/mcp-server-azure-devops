import fc from 'fast-check';
import { parseNumeric } from './get-pull-request-checks/feature';
import { AddPullRequestCommentSchema, MergePullRequestSchema } from './schemas';

describe('pull-requests properties', () => {
  it('parseNumeric accepts finite numbers and decimal strings, and strictly rejects empty/whitespace/booleans/non-finite', () => {
    fc.assert(
      fc.property(
        fc.double({
          noNaN: true,
          noDefaultInfinity: true,
          min: -1e9,
          max: 1e9,
        }),
        (n) => {
          expect(parseNumeric(n)).toBe(n);
          expect(parseNumeric(`  ${n}  `)).toBe(Number(String(n)));
        },
      ),
      { numRuns: 150 },
    );

    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom(
            '',
            '   ',
            '\t\n',
            true,
            false,
            null,
            undefined,
            Number.NaN,
            Infinity,
            -Infinity,
            {},
            [],
          ),
          fc.stringMatching(/^[a-zA-Z]{1,12}$/),
        ),
        (bad) => {
          expect(parseNumeric(bad)).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('AddPullRequestCommentSchema enforces line range ordering: endLineNumber >= lineNumber iff filePath & lineNumber present', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 500 }),
        fc.boolean(),
        (lineA, lineB, hasFilePath) => {
          const result = AddPullRequestCommentSchema.safeParse({
            pullRequestId: 1,
            content: 'review note',
            status: 'active',
            ...(hasFilePath ? { filePath: '/src/app.ts' } : {}),
            lineNumber: lineA,
            endLineNumber: lineB,
          });

          const shouldBeValid = hasFilePath && lineB >= lineA;
          expect(result.success).toBe(shouldBeValid);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('MergePullRequestSchema enforces cross-field policy invariants across arbitrary boolean combinations', () => {
    fc.assert(
      fc.property(
        fc.option(fc.boolean(), { nil: undefined }),
        fc.option(fc.boolean(), { nil: undefined }),
        fc.boolean(),
        fc.boolean(),
        (autoComplete, bypassPolicy, hasBypassReason, hasIgnoreIds) => {
          const input: Record<string, unknown> = { pullRequestId: 42 };
          if (autoComplete !== undefined) {
            input.autoComplete = autoComplete;
          }
          if (bypassPolicy !== undefined) {
            input.bypassPolicy = bypassPolicy;
          }
          if (hasBypassReason) {
            input.bypassReason = 'Hotfix approval';
          }
          if (hasIgnoreIds) {
            input.autoCompleteIgnoreConfigIds = [1, 2];
          }

          const result = MergePullRequestSchema.safeParse(input);

          const bypassReasonViolation =
            hasBypassReason && bypassPolicy !== true;
          const cancelAutoCompleteWithBypass =
            autoComplete === false && bypassPolicy === true;
          const ignoreIdsViolation = hasIgnoreIds && autoComplete !== true;
          const expectedValid =
            !bypassReasonViolation &&
            !cancelAutoCompleteWithBypass &&
            !ignoreIdsViolation;

          expect(result.success).toBe(expectedValid);
        },
      ),
      { numRuns: 100 },
    );
  });
});

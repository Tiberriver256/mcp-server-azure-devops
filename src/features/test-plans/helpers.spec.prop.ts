import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import {
  deduplicateIds,
  extractContinuationToken,
  formatTestStepsXml,
  isValidIsoDateString,
  parseStrictIsoDate,
} from './helpers.ts';

const stepArb = fc.record({
  action: fc.string({ minLength: 1, maxLength: 80 }),
  expectedResult: fc.option(fc.string({ minLength: 0, maxLength: 80 }), {
    nil: undefined,
  }),
});

void describe('test-plans helpers properties', () => {
  void it('formatTestStepsXml produces sequential IDs 2..n+1, exact last=n+1, balanced tags, and escapes raw special chars inside inner content', () => {
    fc.assert(
      fc.property(
        fc.array(stepArb, { minLength: 0, maxLength: 15 }),
        (steps) => {
          const xml = formatTestStepsXml(steps);

          assert.strictEqual(
            xml.startsWith(`<steps id="0" last="${steps.length + 1}">`),
            true,
          );
          assert.strictEqual(xml.endsWith('</steps>'), true);

          const stepOpenTags = [
            ...xml.matchAll(
              /<step id="(\d+)" type="(ActionStep|ValidateStep)">/g,
            ),
          ];
          assert.strictEqual(stepOpenTags.length, steps.length);

          stepOpenTags.forEach((match, idx) => {
            assert.strictEqual(Number(match[1]), idx + 2);
            const expectedTrimmed = steps[idx].expectedResult?.trim() ?? '';
            assert.strictEqual(
              match[2],
              expectedTrimmed.length > 0 ? 'ValidateStep' : 'ActionStep',
            );
          });

          // No raw unescaped '<' inside parameterizedString bodies
          const paramBodies = [
            ...xml.matchAll(
              /<parameterizedString isformatted="true">([\s\S]*?)<\/parameterizedString>/g,
            ),
          ];
          assert.strictEqual(paramBodies.length, steps.length * 2);
          for (const [, body] of paramBodies) {
            assert.strictEqual(body.includes('<'), false);
            assert.strictEqual(body.includes('>'), false);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  void it('parseStrictIsoDate accepts every valid Gregorian calendar date and rejects every impossible day (including non-leap Feb 29)', () => {
    const isLeap = (y: number) =>
      (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const daysInMonth = (y: number, m: number) => {
      if (m === 2) {
        return isLeap(y) ? 29 : 28;
      }
      return [4, 6, 9, 11].includes(m) ? 30 : 31;
    };

    fc.assert(
      fc.property(
        fc.integer({ min: 1900, max: 2200 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 31 }),
        (year, month, day) => {
          const pad2 = (n: number) => String(n).padStart(2, '0');
          const iso = `${year}-${pad2(month)}-${pad2(day)}`;
          const valid = day <= daysInMonth(year, month);
          const parsed = parseStrictIsoDate(iso);

          assert.strictEqual(isValidIsoDateString(iso), valid);
          if (valid) {
            assert.notStrictEqual(parsed, null);
            assert.strictEqual(parsed?.getUTCFullYear(), year);
            assert.strictEqual(parsed?.getUTCMonth(), month - 1);
            assert.strictEqual(parsed?.getUTCDate(), day);
          } else {
            assert.strictEqual(parsed, null);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  void it('deduplicateIds is idempotent, preserves first-appearance order, and contains no duplicates', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 50 }), { maxLength: 40 }),
        (ids) => {
          const deduped = deduplicateIds(ids);
          assert.deepStrictEqual(deduplicateIds(deduped), deduped);
          assert.strictEqual(new Set(deduped).size, deduped.length);
          // Every element's order matches first occurrence in input
          for (let i = 1; i < deduped.length; i++) {
            assert.ok(ids.indexOf(deduped[i - 1]) < ids.indexOf(deduped[i]));
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  void it('extractContinuationToken is header-name case-insensitive and trims whitespace', () => {
    const baseName = 'x-ms-continuationtoken';
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), {
          minLength: baseName.length,
          maxLength: baseName.length,
        }),
        fc.stringMatching(/^[a-zA-Z0-9._=-]{1,40}$/),
        (caseBits, token) => {
          const casedHeader = baseName
            .split('')
            .map((ch, i) => (caseBits[i] ? ch.toUpperCase() : ch.toLowerCase()))
            .join('');
          assert.strictEqual(
            extractContinuationToken({ [casedHeader]: `  ${token}  ` }),
            token,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

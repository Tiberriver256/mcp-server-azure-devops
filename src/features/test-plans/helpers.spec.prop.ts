import fc from 'fast-check';
import {
  deduplicateIds,
  extractContinuationToken,
  formatTestStepsXml,
  isValidIsoDateString,
  parseStrictIsoDate,
} from './helpers';

const stepArb = fc.record({
  action: fc.string({ minLength: 1, maxLength: 80 }),
  expectedResult: fc.option(fc.string({ minLength: 0, maxLength: 80 }), {
    nil: undefined,
  }),
});

describe('test-plans helpers properties', () => {
  it('formatTestStepsXml produces sequential IDs 2..n+1, exact last=n+1, balanced tags, and escapes raw special chars inside inner content', () => {
    fc.assert(
      fc.property(
        fc.array(stepArb, { minLength: 0, maxLength: 15 }),
        (steps) => {
          const xml = formatTestStepsXml(steps);

          expect(
            xml.startsWith(`<steps id="0" last="${steps.length + 1}">`),
          ).toBe(true);
          expect(xml.endsWith('</steps>')).toBe(true);

          const stepOpenTags = [
            ...xml.matchAll(
              /<step id="(\d+)" type="(ActionStep|ValidateStep)">/g,
            ),
          ];
          expect(stepOpenTags).toHaveLength(steps.length);

          stepOpenTags.forEach((match, idx) => {
            expect(Number(match[1])).toBe(idx + 2);
            const expectedTrimmed = steps[idx].expectedResult?.trim() ?? '';
            expect(match[2]).toBe(
              expectedTrimmed.length > 0 ? 'ValidateStep' : 'ActionStep',
            );
          });

          // No raw unescaped '<' inside parameterizedString bodies
          const paramBodies = [
            ...xml.matchAll(
              /<parameterizedString isformatted="true">([\s\S]*?)<\/parameterizedString>/g,
            ),
          ];
          expect(paramBodies).toHaveLength(steps.length * 2);
          for (const [, body] of paramBodies) {
            expect(body).not.toContain('<');
            expect(body).not.toContain('>');
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('parseStrictIsoDate accepts every valid Gregorian calendar date and rejects every impossible day (including non-leap Feb 29)', () => {
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

          expect(isValidIsoDateString(iso)).toBe(valid);
          if (valid) {
            expect(parsed).not.toBeNull();
            expect(parsed?.getUTCFullYear()).toBe(year);
            expect(parsed?.getUTCMonth()).toBe(month - 1);
            expect(parsed?.getUTCDate()).toBe(day);
          } else {
            expect(parsed).toBeNull();
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('deduplicateIds is idempotent, preserves first-appearance order, and contains no duplicates', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 50 }), { maxLength: 40 }),
        (ids) => {
          const deduped = deduplicateIds(ids);
          expect(deduplicateIds(deduped)).toEqual(deduped);
          expect(new Set(deduped).size).toBe(deduped.length);
          // Every element's order matches first occurrence in input
          for (let i = 1; i < deduped.length; i++) {
            expect(ids.indexOf(deduped[i - 1])).toBeLessThan(
              ids.indexOf(deduped[i]),
            );
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('extractContinuationToken is header-name case-insensitive and trims whitespace', () => {
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
          expect(
            extractContinuationToken({ [casedHeader]: `  ${token}  ` }),
          ).toBe(token);
        },
      ),
      { numRuns: 100 },
    );
  });
});

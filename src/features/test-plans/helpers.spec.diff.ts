import fc from 'fast-check';
import { formatTestStepsXml, parseStrictIsoDate } from './helpers';

/**
 * Independent XML entity decoder and step-structure parser oracle.
 * Parses Azure DevOps `<steps>` XML back into `{ action, expectedResult }[]`
 * so we can verify lossless round-trip encoding against `formatTestStepsXml`.
 */
function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function parseStepsXmlOracle(
  xml: string,
): Array<{ id: number; type: string; action: string; expectedResult: string }> {
  const outer = /^<steps id="0" last="(\d+)">([\s\S]*)<\/steps>$/.exec(xml);
  if (!outer) {
    throw new Error(`Malformed outer <steps> XML: ${xml}`);
  }
  const lastAttr = Number(outer[1]);
  const inner = outer[2];

  const stepRe =
    /<step id="(\d+)" type="(ActionStep|ValidateStep)"><parameterizedString isformatted="true">([\s\S]*?)<\/parameterizedString><parameterizedString isformatted="true">([\s\S]*?)<\/parameterizedString><description\/><\/step>/g;

  const decoded: Array<{
    id: number;
    type: string;
    action: string;
    expectedResult: string;
  }> = [];
  let cursor = 0;
  for (const m of inner.matchAll(stepRe)) {
    if (m.index !== cursor) {
      throw new Error(`Unexpected unparsed XML gap at offset ${cursor}`);
    }
    cursor += m[0].length;

    const unwrapParagraph = (encoded: string): string => {
      if (encoded === '') {
        return '';
      }
      const once = unescapeXml(encoded);
      if (!once.startsWith('<P>') || !once.endsWith('</P>')) {
        throw new Error(`Expected <P>...</P> wrapper, got: ${once}`);
      }
      return unescapeXml(once.slice(3, -4));
    };

    decoded.push({
      id: Number(m[1]),
      type: m[2],
      action: unwrapParagraph(m[3]),
      expectedResult: unwrapParagraph(m[4]),
    });
  }

  if (cursor !== inner.length) {
    throw new Error(`Trailing unparsed XML at offset ${cursor}`);
  }
  if (lastAttr !== decoded.length + 1) {
    throw new Error(`Expected last="${decoded.length + 1}", got "${lastAttr}"`);
  }
  return decoded;
}

/**
 * Independent Gregorian UTC epoch oracle for ISO-8601 date-times with offset.
 */
function oracleIsoDateTimeEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  offsetSign: '+' | '-',
  offsetHours: number,
  offsetMinutes: number,
): number {
  const localUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = (offsetHours * 60 + offsetMinutes) * 60 * 1000;
  return offsetSign === '+' ? localUtc - offsetMs : localUtc + offsetMs;
}

describe('test-plans helpers differential tests vs XML & Gregorian epoch oracles', () => {
  it('formatTestStepsXml round-trips losslessly through independent XML parser oracle for arbitrary strings', () => {
    const stepArb = fc.record({
      action: fc.string({ minLength: 1, maxLength: 60 }),
      expectedResult: fc.option(fc.string({ minLength: 0, maxLength: 60 }), {
        nil: undefined,
      }),
    });

    fc.assert(
      fc.property(
        fc.array(stepArb, { minLength: 0, maxLength: 12 }),
        (steps) => {
          const xml = formatTestStepsXml(steps);
          const parsed = parseStepsXmlOracle(xml);

          expect(parsed).toHaveLength(steps.length);
          steps.forEach((step, idx) => {
            expect(parsed[idx].id).toBe(idx + 2);
            expect(parsed[idx].action).toBe(step.action);
            expect(parsed[idx].expectedResult).toBe(
              step.expectedResult?.trim() ?? '',
            );
          });
        },
      ),
      { numRuns: 150 },
    );
  });

  it('parseStrictIsoDate timestamp agrees exactly with independent Gregorian UTC offset epoch oracle', () => {
    const pad2 = (n: number) => String(n).padStart(2, '0');

    fc.assert(
      fc.property(
        fc.integer({ min: 1970, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 59 }),
        fc.constantFrom<'+' | '-'>('+', '-'),
        fc.integer({ min: 0, max: 14 }),
        fc.constantFrom(0, 15, 30, 45),
        (year, month, day, hour, minute, second, sign, offH, offM) => {
          const iso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${sign}${pad2(offH)}:${pad2(offM)}`;
          const parsed = parseStrictIsoDate(iso);
          const expectedMs = oracleIsoDateTimeEpochMs(
            year,
            month,
            day,
            hour,
            minute,
            second,
            sign,
            offH,
            offM,
          );
          expect(parsed?.getTime()).toBe(expectedMs);
        },
      ),
      { numRuns: 150 },
    );
  });
});

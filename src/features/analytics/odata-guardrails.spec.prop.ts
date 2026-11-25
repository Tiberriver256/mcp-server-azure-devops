import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { AzureDevOpsValidationError } from '../../shared/errors/index.ts';
import {
  buildSingleOpBatchPayload,
  escapeODataStringLiteral,
  findDateTimeWithoutTimezone,
  parseSingleOpBatchResponse,
  stripODataSingleQuotes,
  validateAnalyticsQuery,
  validateEntitySet,
  validateSameOriginNextLink,
} from './odata-guardrails.ts';
import { ALLOWED_ENTITY_SETS } from './types.ts';

const FORBIDDEN_ENTITY_CHAR_ARB = fc.constantFrom(
  '(',
  ')',
  '/',
  '\\',
  '?',
  '#',
  ' ',
  '\t',
  '..',
);

const SAFE_DATETIME_PARTS_ARB = fc.record({
  year: fc.integer({ min: 2000, max: 2099 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 }),
  hour: fc.integer({ min: 0, max: 23 }),
  minute: fc.integer({ min: 0, max: 59 }),
  second: fc.integer({ min: 0, max: 59 }),
});

function formatBareIso(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

void describe('OData Analytics guardrails properties', () => {
  void it('validateEntitySet rejects any input containing key-addressing, traversal, query, or whitespace characters', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALLOWED_ENTITY_SETS),
        FORBIDDEN_ENTITY_CHAR_ARB,
        fc.string({ minLength: 0, maxLength: 20 }),
        (validBase, badToken, suffix) => {
          const mutated = `${validBase}${badToken}${suffix}`;
          // Trim-only outer spaces might strip a trailing space; inject mid-string if needed
          const candidate =
            mutated.trim().toLowerCase() === validBase.toLowerCase()
              ? `${validBase}${badToken}x`
              : mutated;
          assert.throws(
            () => validateEntitySet(candidate),
            AzureDevOpsValidationError,
          );
        },
      ),
      { numRuns: 150 },
    );
  });

  void it('validateEntitySet normalizes every allowed entitySet regardless of ASCII casing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALLOWED_ENTITY_SETS),
        fc.boolean(),
        (entitySet, upper) => {
          const cased = upper
            ? entitySet.toUpperCase()
            : entitySet.toLowerCase();
          assert.equal(validateEntitySet(cased), entitySet);
        },
      ),
      { numRuns: 100 },
    );
  });

  void it('escapeODataStringLiteral prevents arbitrary user strings from triggering guardrail false positives', () => {
    const adversarialStrings = fc.oneof(
      fc.string({ minLength: 0, maxLength: 80 }),
      fc.constantFrom(
        "O'Brien countdistinct 2026-11-01T00:00:00",
        "Revisions WorkItemId $search 'quoted'",
        "'''2026-01-01''' topcount(5, StoryPoints)",
      ),
    );

    fc.assert(
      fc.property(adversarialStrings, (rawValue) => {
        const literal = escapeODataStringLiteral(rawValue);
        const stripped = stripODataSingleQuotes(`Title eq ${literal}`);
        assert.equal(stripped, "Title eq ''");

        const validated = validateAnalyticsQuery({
          entitySet: 'WorkItems',
          select: ['WorkItemId', 'Title'],
          filter: `Title eq ${literal}`,
        });
        assert.equal(validated.entitySet, 'WorkItems');
      }),
      { numRuns: 150 },
    );
  });

  void it('findDateTimeWithoutTimezone always detects timezone-less ISO timestamps and always accepts Z or ±HH:MM', () => {
    const tzOffsetArb = fc.oneof(
      fc.constant('Z'),
      fc.constant('z'),
      fc
        .tuple(
          fc.constantFrom('+', '-'),
          fc.integer({ min: 0, max: 14 }),
          fc.constantFrom(0, 15, 30, 45),
        )
        .map(
          ([sign, h, m]) =>
            `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        ),
    );

    fc.assert(
      fc.property(SAFE_DATETIME_PARTS_ARB, tzOffsetArb, (parts, tz) => {
        const bare = formatBareIso(parts);
        assert.equal(
          findDateTimeWithoutTimezone(`ChangedDate ge ${bare}`),
          bare,
        );
        assert.equal(
          findDateTimeWithoutTimezone(`ChangedDate ge ${bare}${tz}`),
          undefined,
        );
      }),
      { numRuns: 150 },
    );
  });

  void it('validateSameOriginNextLink rejects every off-origin host, scheme, or port and accepts same-origin /_odata/ URLs', () => {
    const base = 'https://analytics.dev.azure.com/myorg';
    const evilOriginArb = fc.oneof(
      fc.constant('http://analytics.dev.azure.com'),
      fc.constant('https://analytics.dev.azure.com:8443'),
      fc.constant('https://analytics.dev.azure.com.evil.example'),
      fc
        .stringMatching(/^[a-z]{3,12}$/)
        .map((host) => `https://${host}.example.com`),
    );

    fc.assert(
      fc.property(
        evilOriginArb,
        fc.stringMatching(/^[A-Za-z0-9_-]{1,20}$/),
        (evilOrigin, token) => {
          const evilUrl = `${evilOrigin}/myorg/_odata/v3.0-preview/WorkItems?$skiptoken=${token}`;
          assert.throws(
            () => validateSameOriginNextLink(evilUrl, base),
            AzureDevOpsValidationError,
          );

          const goodUrl = `https://analytics.dev.azure.com/myorg/_odata/v3.0-preview/WorkItems?$skiptoken=${token}`;
          assert.equal(validateSameOriginNextLink(goodUrl, base), goodUrl);
        },
      ),
      { numRuns: 150 },
    );
  });

  void it('single-op $batch builder emits strictly 1 GET part and response parser round-trips arbitrary JSON payloads', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            WorkItemId: fc.integer({ min: 1, max: 100000 }),
            Title: fc.string({ minLength: 0, maxLength: 40 }),
          }),
          { maxLength: 5 },
        ),
        (rawRows) => {
          const rows = rawRows.map((r) => ({
            WorkItemId: r.WorkItemId,
            Title: r.Title,
          }));
          const batchReq = buildSingleOpBatchPayload(
            'WorkItems?$select=WorkItemId,Title',
          );
          assert.equal((batchReq.body.match(/^GET\s+/gm) ?? []).length, 1);

          const respBoundary = 'batchresponse_prop_test';
          const payload = { value: rows };
          const rawResp =
            `--${respBoundary}\r\n` +
            `Content-Type: application/http\r\n` +
            `Content-Transfer-Encoding: binary\r\n\r\n` +
            `HTTP/1.1 200 OK\r\n` +
            `Content-Type: application/json\r\n\r\n` +
            `${JSON.stringify(payload)}\r\n` +
            `--${respBoundary}--\r\n`;

          const parsed = parseSingleOpBatchResponse(
            rawResp,
            `multipart/mixed; boundary=${respBoundary}`,
          );
          assert.equal(parsed.status, 200);
          assert.deepEqual(parsed.data, payload);
        },
      ),
      { numRuns: 100 },
    );
  });
});

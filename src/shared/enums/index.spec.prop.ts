import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import {
  commentThreadStatusMapper,
  commentTypeMapper,
  gitVersionTypeMapper,
  pullRequestMergeStrategyMapper,
  pullRequestStatusMapper,
} from './index.ts';
import type { EnumMapper } from './index.ts';

const ALL_MAPPERS: Array<[string, EnumMapper]> = [
  ['commentThreadStatusMapper', commentThreadStatusMapper],
  ['commentTypeMapper', commentTypeMapper],
  ['pullRequestStatusMapper', pullRequestStatusMapper],
  ['pullRequestMergeStrategyMapper', pullRequestMergeStrategyMapper],
  ['gitVersionTypeMapper', gitVersionTypeMapper],
];

const PROTO_KEYS = [
  'toString',
  'valueOf',
  'constructor',
  '__proto__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
];

void describe('shared/enums properties', () => {
  for (const [name, mapper] of ALL_MAPPERS) {
    void it(`${name} satisfies bijection, arbitrary random casing, and Object.prototype safety`, () => {
      // Prototype keys must NEVER resolve to functions or numbers
      for (const protoKey of PROTO_KEYS) {
        assert.strictEqual(mapper.toEnum(protoKey), undefined);
      }

      const keyArb = fc.constantFrom(...mapper.keys);
      const caseFlipArb = fc
        .tuple(keyArb, fc.array(fc.boolean(), { minLength: 32, maxLength: 32 }))
        .map(([key, bits]) => ({
          canonical: key,
          mixed: key
            .split('')
            .map((ch, idx) =>
              bits[idx % bits.length] ? ch.toUpperCase() : ch.toLowerCase(),
            )
            .join(''),
        }));

      fc.assert(
        fc.property(caseFlipArb, ({ canonical, mixed }) => {
          const enumVal = mapper.toEnum(mixed);
          assert.ok(typeof enumVal === 'number');
          assert.strictEqual(enumVal, mapper.toEnum(canonical));
          assert.strictEqual(mapper.toString(enumVal), canonical);
        }),
        { numRuns: 100 },
      );

      // Unknown numbers always fall back to 'unknown'
      const knownNumbers = new Set(mapper.keys.map((k) => mapper.toEnum(k)!));
      fc.assert(
        fc.property(
          fc
            .integer({ min: -1000, max: 1000 })
            .filter((n) => !knownNumbers.has(n)),
          (unknownNum) => {
            assert.strictEqual(mapper.toString(unknownNum), 'unknown');
          },
        ),
        { numRuns: 50 },
      );
    });
  }
});

import fc from 'fast-check';
import {
  commentThreadStatusMapper,
  commentTypeMapper,
  gitVersionTypeMapper,
  pullRequestMergeStrategyMapper,
  pullRequestStatusMapper,
} from './index';
import type { EnumMapper } from './index';

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

describe('shared/enums properties', () => {
  it.each(ALL_MAPPERS)(
    '%s satisfies bijection, arbitrary random casing, and Object.prototype safety',
    (_name, mapper) => {
      // Prototype keys must NEVER resolve to functions or numbers
      for (const protoKey of PROTO_KEYS) {
        expect(mapper.toEnum(protoKey)).toBeUndefined();
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
          expect(typeof enumVal).toBe('number');
          expect(enumVal).toBe(mapper.toEnum(canonical));
          expect(mapper.toString(enumVal as number)).toBe(canonical);
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
            expect(mapper.toString(unknownNum)).toBe('unknown');
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});

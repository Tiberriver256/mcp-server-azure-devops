import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { compileGlobMatcher, matchesGlob } from './glob.ts';

function matchSingleSegment(segment: string, patternSegment: string): boolean {
  if (segment.startsWith('.') && !patternSegment.startsWith('.')) {
    return false;
  }

  // Expand single-level {a,b,c} brace expressions into regex alternations
  let regexSrc = '^';
  let i = 0;
  while (i < patternSegment.length) {
    const ch = patternSegment[i];
    if (ch === '*') {
      regexSrc += '[^/]*';
      i += 1;
    } else if (ch === '?') {
      regexSrc += '[^/]';
      i += 1;
    } else if (ch === '{') {
      const closeIdx = patternSegment.indexOf('}', i + 1);
      if (closeIdx !== -1) {
        const alts = patternSegment
          .slice(i + 1, closeIdx)
          .split(',')
          .map((alt) => alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        regexSrc += `(?:${alts.join('|')})`;
        i = closeIdx + 1;
        continue;
      }
      regexSrc += '\\{';
      i += 1;
    } else {
      regexSrc += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  regexSrc += '$';

  return new RegExp(regexSrc).test(segment);
}

/**
 * Independent reference POSIX glob-to-RegExp oracle supporting single- and
 * multi-segment paths, `*`, `?`, `{a,b}` alternation, leading `!` negation,
 * absolute-path leading `/`, and per-segment dotfile rules.
 */
function referenceGlobMatch(value: string, rawPattern: string): boolean {
  if (rawPattern === '') {
    return value === '';
  }

  let negated = false;
  let pattern = rawPattern;
  while (pattern.startsWith('!')) {
    negated = !negated;
    pattern = pattern.slice(1);
  }

  if (pattern === '') {
    return negated ? value !== '' : value === '';
  }

  // POSIX/minimatch rule: empty string never matches a non-empty glob pattern
  if (value === '') {
    return negated;
  }

  const normValue = value.replace(/\/+/g, '/');
  const normPattern = pattern.replace(/\/+/g, '/');

  // POSIX absolute-path rule: leading '/' must match explicitly
  if (normValue.startsWith('/') !== normPattern.startsWith('/')) {
    return negated;
  }

  const valueSegments = normValue.split('/');
  const patternSegments = normPattern.split('/');
  if (valueSegments.length !== patternSegments.length) {
    return negated;
  }

  const matched = valueSegments.every((seg, idx) =>
    matchSingleSegment(seg, patternSegments[idx]),
  );
  return negated ? !matched : matched;
}

const repoNameArb = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9._+-]{1,12}(\/[a-zA-Z0-9._+-]{1,10})?$/),
  fc.constantFrom(
    '.hidden',
    '.git',
    'api-service',
    'web-app',
    'my.repo+1',
    'service(v2)',
    'a/b',
    'src/app.ts',
    'org/team/repo',
    'a',
    'ab',
  ),
);

const globAtomArb = fc.constantFrom(
  '*',
  '?',
  'api',
  'web',
  'service',
  'repo',
  '-',
  '.',
  '+',
  '/',
  '(',
  ')',
  '{api,web}',
  '{a,b,c}',
);

const globPatternArb = fc
  .tuple(
    fc.constantFrom('', '!', '!!'),
    fc.array(globAtomArb, { minLength: 1, maxLength: 4 }),
  )
  .map(([bangs, atoms]) => `${bangs}${atoms.join('')}`);

const singleStarGlobPatternArb = globPatternArb.filter(
  (p) => !p.includes('**'),
);

void describe('glob differential tests vs independent RegExp oracle', () => {
  void it('matchesGlob and compileGlobMatcher agree identically with independent RegExp oracle across randomized patterns & paths', () => {
    fc.assert(
      fc.property(singleStarGlobPatternArb, repoNameArb, (pattern, value) => {
        const expected = referenceGlobMatch(value, pattern);
        const compiled = compileGlobMatcher(pattern);

        assert.strictEqual(matchesGlob(value, pattern), expected);
        assert.strictEqual(compiled(value), expected);
      }),
      { numRuns: 300 },
    );
  });

  void it('compileGlobMatcher and matchesGlob agree identically even on globstar (**) and multi-segment slash paths', () => {
    fc.assert(
      fc.property(globPatternArb, repoNameArb, (pattern, value) => {
        assert.strictEqual(
          compileGlobMatcher(pattern)(value),
          matchesGlob(value, pattern),
        );
      }),
      { numRuns: 300 },
    );
  });

  void it('handles empty pattern, multi-segment slash paths, and empty value edge cases identically to oracle', () => {
    for (const pattern of ['', '!', '!!', '*', '!*', '*/*']) {
      for (const value of ['', 'a', '.dot', 'a/b', 'src/app.ts', '/leading']) {
        const expected = referenceGlobMatch(value, pattern);
        assert.strictEqual(matchesGlob(value, pattern), expected);
        assert.strictEqual(compileGlobMatcher(pattern)(value), expected);
      }
    }
  });
});

import fc from 'fast-check';
import { compileGlobMatcher, matchesGlob } from './glob';

/**
 * Independent reference glob-to-RegExp oracle for single-segment repository
 * names supporting `*`, `?`, `{a,b}` alternation, leading `!` negation,
 * dotfiles-hidden-unless-explicit, and literal regex metacharacters.
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

  // Dotfile rule: leading dot in value only matches if pattern explicitly starts with '.'
  if (value.startsWith('.') && !pattern.startsWith('.')) {
    return negated;
  }

  // Expand single-level {a,b,c} brace expressions into regex alternations
  let regexSrc = '^';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      regexSrc += '[^/]*';
      i += 1;
    } else if (ch === '?') {
      regexSrc += '[^/]';
      i += 1;
    } else if (ch === '{') {
      const closeIdx = pattern.indexOf('}', i + 1);
      if (closeIdx !== -1) {
        const alts = pattern
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

  const matched = new RegExp(regexSrc).test(value);
  return negated ? !matched : matched;
}

const repoNameArb = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9._+-]{1,20}$/),
  fc.constantFrom(
    '.hidden',
    '.git',
    'api-service',
    'web-app',
    'my.repo+1',
    'service(v2)',
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

describe('glob differential tests vs independent RegExp oracle', () => {
  it('matchesGlob and compileGlobMatcher agree identically with independent RegExp oracle across randomized patterns & repo names', () => {
    fc.assert(
      fc.property(globPatternArb, repoNameArb, (pattern, value) => {
        const expected = referenceGlobMatch(value, pattern);
        const compiled = compileGlobMatcher(pattern);

        expect(matchesGlob(value, pattern)).toBe(expected);
        expect(compiled(value)).toBe(expected);
      }),
      { numRuns: 300 },
    );
  });

  it('handles empty pattern & empty value edge cases identically to oracle', () => {
    for (const pattern of ['', '!', '!!', '*']) {
      for (const value of ['', 'a', '.dot']) {
        const expected = referenceGlobMatch(value, pattern);
        expect(matchesGlob(value, pattern)).toBe(expected);
        expect(compileGlobMatcher(pattern)(value)).toBe(expected);
      }
    }
  });
});

import { posix } from 'path';

/**
 * Zero-dependency glob matcher backed by Node.js 22 native path.posix.matchesGlob.
 * Supports `*`, `?`, `**`, `[abc]`, `{a,b}`, leading negation (`!pattern`),
 * and ignores dotfiles unless the pattern explicitly starts with `.` (matching minimatch defaults).
 */
export function matchesGlob(value: string, pattern: string): boolean {
  if (pattern === '' && value === '') {
    return true;
  }
  if (pattern === '') {
    return false;
  }

  let negated = false;
  let effectivePattern = pattern;
  while (effectivePattern.startsWith('!')) {
    negated = !negated;
    effectivePattern = effectivePattern.slice(1);
  }

  if (effectivePattern === '') {
    return negated ? value !== '' : value === '';
  }

  const matched = posix.matchesGlob(value, effectivePattern);
  return negated ? !matched : matched;
}

/**
 * Pre-process a glob pattern once for repeated matching inside loops.
 */
export function compileGlobMatcher(
  pattern: string,
): (value: string) => boolean {
  if (pattern === '*') {
    return (value: string) => value.length > 0 && !value.startsWith('.');
  }

  let negated = false;
  let effectivePattern = pattern;
  while (effectivePattern.startsWith('!')) {
    negated = !negated;
    effectivePattern = effectivePattern.slice(1);
  }

  if (effectivePattern === '') {
    return negated
      ? (value: string) => value !== ''
      : (value: string) => value === '';
  }

  return negated
    ? (value: string) => !posix.matchesGlob(value, effectivePattern)
    : (value: string) => posix.matchesGlob(value, effectivePattern);
}

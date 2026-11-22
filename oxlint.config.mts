import cloudflare from '@cloudflare/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
  ...cloudflare,
  env: {
    ...cloudflare.env,
    builtin: true,
    node: true,
    es6: true,
    jest: true,
  },
  ignorePatterns: [
    ...(cloudflare.ignorePatterns ?? []),
    'dist/**/*',
    'project-management/**/*',
    '.pi/**/*',
  ],
  rules: {
    ...cloudflare.rules,

    // Carry forward existing project rule choices
    'oxc/number-arg-out-of-range': 'off', // Carried over from previous .oxlintrc.json

    // Stylistic / opinionated @nkzw & unicorn rules that don't match this codebase's conventions
    'no-console': 'off', // CLI/server and integration tests intentionally log via console/stderr
    'object-shorthand': 'off', // Stylistic preference
    'import/no-namespace': 'off', // Namespace imports are used intentionally in feature handlers and mocks
    'typescript/array-type': 'off', // Both T[] and Array<T> are used across the codebase
    'unicorn/catch-error-name': 'off', // Both `error` and `err` are used in catch blocks
    'unicorn/consistent-function-scoping': 'off', // Helper closures inside handlers/tests are intentional
    'unicorn/numeric-separators-style': 'off', // Stylistic preference
    'unicorn/prefer-at': 'off', // Stylistic preference
    'unicorn/prefer-node-protocol': 'off', // Existing Node imports omit the `node:` prefix
    'unicorn/prefer-optional-catch-binding': 'off', // Stylistic preference
    'unicorn/prefer-string-raw': 'off', // Stylistic preference
    'unicorn/prefer-string-replace-all': 'off', // Stylistic preference
    'unicorn/prefer-string-slice': 'off', // Stylistic preference
    'unicorn/prefer-top-level-await': 'off', // Entry point uses explicit main().catch(...) for CJS/Node16 compatibility
    'unicorn/text-encoding-identifier-case': 'off', // Stylistic preference

    // @nkzw custom `quality/*` JS-plugin rules (opinionated style/patterns)
    'quality/no-array-filter-map': 'off',
    'quality/no-chained-type-assertions': 'off',
    'quality/no-conditional-empty-object-spread': 'off',
    'quality/no-known-value-widening': 'off',
    'quality/no-object-parameters': 'off',
    'quality/no-unknown-returns': 'off',
    'quality/no-unknown-type-aliases': 'off',
    'quality/no-unsafe-dictionary-type': 'off',
    'quality/no-widen-then-assert': 'off',

    // Deferred type-safety rules (tracked for incremental hardening; azure-devops-node-api exposes `any` in several places)
    'typescript/no-unsafe-argument': 'off',
    'typescript/no-unsafe-assignment': 'off',
    'typescript/no-unsafe-call': 'off',
    'typescript/no-unsafe-member-access': 'off',
    'typescript/no-unsafe-return': 'off',
    'typescript/no-unsafe-type-assertion': 'off',
    'typescript/no-unnecessary-type-assertion': 'off',

    // Temporary during migration (fixed in subsequent commits in this PR)
    curly: 'off',
    'import/no-self-import': 'off',
    'no-promise-executor-return': 'off',
    'preserve-caught-error': 'off',
    'typescript/consistent-type-imports': 'off',
    'typescript/no-misused-spread': 'off',
    'typescript/no-non-null-assertion': 'off',
    'unicorn/prefer-set-has': 'off',
  },
  overrides: [
    ...(cloudflare.overrides ?? []),
    {
      // Carry forward test-file relaxations for this repo's *.spec.{unit,int,e2e}.ts convention
      files: [
        '**/*.spec.unit.ts',
        '**/*.spec.int.ts',
        '**/*.spec.e2e.ts',
        'tests/**/*.ts',
      ],
      rules: {
        'typescript/no-explicit-any': 'off',
        'typescript/no-non-null-assertion': 'off',
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-return': 'off',
        'typescript/only-throw-error': 'off',
        'typescript/unbound-method': 'off',
      },
    },
  ],
});

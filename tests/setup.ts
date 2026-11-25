/**
 * Node test runner setup module preloaded via `--import ./tests/setup.ts`.
 */

import path from 'node:path';
import { afterEach, beforeEach, mock } from 'node:test';
import type { Mock } from 'node:test';
import { loadEnvFile } from '../src/shared/config/load-env.ts';

loadEnvFile(path.resolve(process.cwd(), '.env'));

// Test runs should prefer PAT auth when a PAT is present.
if (process.env.AZURE_DEVOPS_PAT) {
  process.env.AZURE_DEVOPS_AUTH_METHOD = 'pat';
}

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

const quietLog: typeof console.log = (...args: unknown[]) => {
  const first = String(args[0] ?? '');
  if (first.includes('Skip') || first.includes('Environment')) {
    originalConsoleLog(...args);
  }
};

const quietWarn: typeof console.warn = (...args: unknown[]) => {
  const first = String(args[0] ?? '');
  if (first.includes('Warning') || first.includes('WARNING')) {
    originalConsoleWarn(...args);
  }
};

let logMock: Mock<typeof console.log> | undefined;
let warnMock: Mock<typeof console.warn> | undefined;
let activeFilterCount = 0;
const filteredTests = new WeakSet<object>();

const isNodeTestRunner =
  process.env.NODE_TEST_CONTEXT !== undefined ||
  process.execArgv.includes('--test');

if (isNodeTestRunner) {
  beforeEach((t) => {
    if (process.env.DEBUG !== 'true') {
      if (activeFilterCount === 0) {
        logMock = mock.method(console, 'log', quietLog);
        warnMock = mock.method(console, 'warn', quietWarn);
      }
      activeFilterCount += 1;
      filteredTests.add(t);
    }
  });

  afterEach((t) => {
    if (!filteredTests.delete(t)) {
      return;
    }
    activeFilterCount -= 1;
    if (activeFilterCount === 0) {
      logMock?.mock.restore();
      warnMock?.mock.restore();
      logMock = undefined;
      warnMock = undefined;
    }
  });
}

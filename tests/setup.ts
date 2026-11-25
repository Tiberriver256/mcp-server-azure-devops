/**
 * Jest setup file that runs before all tests.
 */

import path from 'path';
import { loadEnvFile } from '../src/shared/config/load-env';

loadEnvFile(path.resolve(process.cwd(), '.env'));

// Test runs should prefer PAT auth when a PAT is present.
if (process.env.AZURE_DEVOPS_PAT) {
  process.env.AZURE_DEVOPS_AUTH_METHOD = 'pat';
}

jest.setTimeout(30000);

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

const quietLog = (...args: unknown[]) => {
  const first = args[0]?.toString() ?? '';
  if (first.includes('Skip') || first.includes('Environment')) {
    originalConsoleLog(...args);
  }
};

const quietWarn = (...args: unknown[]) => {
  const first = args[0]?.toString() ?? '';
  if (first.includes('Warning') || first.includes('WARNING')) {
    originalConsoleWarn(...args);
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  if (process.env.DEBUG !== 'true') {
    jest.spyOn(console, 'log').mockImplementation(quietLog);
    jest.spyOn(console, 'warn').mockImplementation(quietWarn);
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

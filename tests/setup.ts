/**
 * Jest setup file that runs before all tests
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
// Use silent mode to prevent warning when .env file is not found
const result = dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
});

// Only log if .env file was successfully loaded and DEBUG=true
if (!result.error && process.env.DEBUG === 'true') {
  console.log('Environment variables loaded from .env file');
}

// Increase timeout for integration tests
jest.setTimeout(30000); // 30 seconds

// Suppress console output during tests unless specifically desired
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

if (process.env.DEBUG !== 'true') {
  global.console.log = (...args: any[]) => {
    if (
      args[0]?.toString().includes('Skip') ||
      args[0]?.toString().includes('Environment')
    ) {
      originalConsoleLog(...args);
    }
  };

  global.console.warn = (...args: any[]) => {
    if (args[0]?.toString().includes('Warning')) {
      originalConsoleWarn(...args);
    }
  };

  global.console.error = (...args: any[]) => {
    originalConsoleError(...args);
  };
}

// Global setup before tests run
beforeAll(() => {
  console.log('Starting tests with Testing Trophy approach...');
});

// Global cleanup after all tests
afterAll(() => {
  console.log('All tests completed.');
});

// Clear all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(originalConsoleLog);
  jest.spyOn(console, 'warn').mockImplementation(originalConsoleWarn);
  jest.spyOn(console, 'error').mockImplementation(originalConsoleError);
});

// Restore all mocks after each test
afterEach(() => {
  jest.restoreAllMocks();
});

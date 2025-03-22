/**
 * Jest setup file that runs before all tests
 */

// Set default timeout longer for all tests
jest.setTimeout(10000);

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
});

// Restore all mocks after each test
afterEach(() => {
  jest.restoreAllMocks();
});

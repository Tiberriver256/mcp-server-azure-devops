/**
 * Test utilities for work item tests
 * These utilities help reduce test execution time and improve test reliability
 */

/**
 * Times test execution to help identify slow tests
 * @param testName Name of the test
 * @param fn Test function to execute
 */
export async function timeTest(testName: string, fn: () => Promise<void>) {
  const start = performance.now();
  await fn();
  const end = performance.now();

  const duration = end - start;
  if (duration > 100) {
    console.warn(`Test "${testName}" is slow (${duration.toFixed(2)}ms)`);
  }
  return duration;
}

/**
 * Setup function to prepare test environment
 * Call at beginning of test to ensure consistent setup
 */
export function setupTestEnvironment() {
  // Set any environment variables needed for tests
  const originalEnv = { ...process.env };

  return {
    // Clean up function to restore environment
    cleanup: () => {
      // Restore original environment
      process.env = originalEnv;
    },
  };
}

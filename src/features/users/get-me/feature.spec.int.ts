import { WebApi } from 'azure-devops-node-api';
import { getMe } from '../get-me';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

describe('getMe Integration', () => {
  let connection: WebApi | null = null;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
  });

  test('should get authenticated user profile information', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest() || !connection) {
      console.log('Skipping getMe integration test - no connection available');
      return;
    }

    // Act - make a direct API call using Axios
    const result = await getMe(connection);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(result.displayName).toBeDefined();
    expect(typeof result.displayName).toBe('string');
    expect(result.displayName.length).toBeGreaterThan(0);

    // Email should be defined, a string, and not empty
    expect(result.email).toBeDefined();
    expect(typeof result.email).toBe('string');
    expect(result.email.length).toBeGreaterThan(0);
  });
});

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getMe } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getMe Integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;

    before(async () => {
      // Get a real connection using environment variables
      const testConnection = await getTestConnection();
      if (!testConnection) {
        throw new Error(
          'Connection should be available when integration tests are enabled',
        );
      }
      connection = testConnection;
    });

    void test('should get authenticated user profile information', async () => {
      // Act - make a direct API call using Axios
      const result = await getMe(connection);

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.id, undefined);
      assert.strictEqual(typeof result.id, 'string');
      assert.notStrictEqual(result.displayName, undefined);
      assert.strictEqual(typeof result.displayName, 'string');
      assert.ok(result.displayName.length > 0);

      // Email should be defined, a string, and not empty
      assert.notStrictEqual(result.email, undefined);
      assert.strictEqual(typeof result.email, 'string');
      assert.ok(result.email.length > 0);
    });
  },
);

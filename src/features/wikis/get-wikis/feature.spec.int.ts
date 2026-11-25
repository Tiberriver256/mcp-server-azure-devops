import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getWikis } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getWikis integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let projectName: string;

    before(async () => {
      // Get a real connection using environment variables
      const testConnection = await getTestConnection();
      if (!testConnection) {
        throw new Error(
          'Connection should be available when integration tests are enabled',
        );
      }
      connection = testConnection;
      projectName =
        process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    });

    void test('should retrieve wikis from Azure DevOps', async () => {
      // Get the wikis
      const result = await getWikis(connection, {
        projectId: projectName,
      });

      // Verify the result
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(Array.isArray(result), true);
      if (result.length > 0) {
        assert.notStrictEqual(result[0].name, undefined);
        assert.notStrictEqual(result[0].id, undefined);
        assert.notStrictEqual(result[0].type, undefined);
      }
    });
  },
);

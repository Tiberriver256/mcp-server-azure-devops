import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getProject } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getProject integration',
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

    void test('should retrieve a real project from Azure DevOps', async () => {
      // Act - make an actual API call to Azure DevOps
      const result = await getProject(connection, projectName);

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.name, projectName);
      assert.notStrictEqual(result.id, undefined);
      assert.notStrictEqual(result.url, undefined);
      assert.notStrictEqual(result.state, undefined);

      // Verify basic project structure
      assert.notStrictEqual(result.visibility, undefined);
      assert.notStrictEqual(result.lastUpdateTime, undefined);
    });

    void test('should throw error when project is not found', async () => {
      // Use a non-existent project name
      const nonExistentProjectName = 'non-existent-project-' + Date.now();

      // Act & Assert - should throw an error for non-existent project
      await assert.rejects(
        () => getProject(connection, nonExistentProjectName),
        /not found|Failed to get project/,
      );
    });
  },
);

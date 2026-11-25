import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { listRepositories } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import type { ListRepositoriesOptions } from '../types.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'listRepositories integration',
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

    void test('should list repositories in a project', async () => {
      const options: ListRepositoriesOptions = {
        projectId: projectName,
      };

      // Act - make an actual API call to Azure DevOps
      const result = await listRepositories(connection, options);

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(Array.isArray(result), true);

      // Check structure of returned items (even if empty)
      if (result.length > 0) {
        const firstRepo = result[0];
        assert.notStrictEqual(firstRepo.id, undefined);
        assert.notStrictEqual(firstRepo.name, undefined);
        assert.notStrictEqual(firstRepo.project, undefined);

        if (firstRepo.project) {
          assert.strictEqual(firstRepo.project.name, projectName);
        }
      }
    });

    void test('should include links when option is specified', async () => {
      const options: ListRepositoriesOptions = {
        projectId: projectName,
        includeLinks: true,
      };

      // Act - make an actual API call to Azure DevOps
      const result = await listRepositories(connection, options);

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(Array.isArray(result), true);

      // Verify links are included, if repositories exist
      if (result.length > 0) {
        const firstRepo = result[0];
        assert.notStrictEqual(firstRepo._links, undefined);
      }
    });
  },
);

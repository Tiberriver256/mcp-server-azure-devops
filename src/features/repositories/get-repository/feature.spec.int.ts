import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getRepository } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getRepository integration',
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

    void test('should retrieve a real repository from Azure DevOps', async () => {
      // First, get a list of repos to find one to test with
      const gitApi = await connection.getGitApi();
      const repos = await gitApi.getRepositories(projectName);

      assert.ok(repos.length > 0);

      // Use the first repo as a test subject
      const testRepo = repos[0];

      // Act - make an actual API call to Azure DevOps
      const result = await getRepository(
        connection,
        projectName,
        testRepo.name || testRepo.id || '',
      );

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.id, testRepo.id);
      assert.strictEqual(result.name, testRepo.name);
      assert.notStrictEqual(result.project, undefined);
      if (result.project) {
        assert.strictEqual(result.project.name, projectName);
      }
    });

    void test('should throw error when repository is not found', async () => {
      // Use a non-existent repository name
      const nonExistentRepoName = 'non-existent-repo-' + Date.now();

      // Act & Assert - should throw an error for non-existent repo
      await assert.rejects(
        () => getRepository(connection, projectName, nonExistentRepoName),
        /not found|Failed to get repository/,
      );
    });
  },
);

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { listProjects } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import type { ListProjectsOptions } from '../types.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'listProjects integration',
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

    void test('should list projects in the organization', async () => {
      // Act - make an actual API call to Azure DevOps
      const result = await listProjects(connection);

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(Array.isArray(result), true);

      // Check structure of returned items (even if empty)
      if (result.length > 0) {
        const firstProject = result[0];
        assert.notStrictEqual(firstProject.id, undefined);
        assert.notStrictEqual(firstProject.name, undefined);
        assert.notStrictEqual(firstProject.url, undefined);
        assert.notStrictEqual(firstProject.state, undefined);
      }
    });

    void test('should apply pagination options', async () => {
      const options: ListProjectsOptions = {
        top: 2, // Only get up to 2 projects
      };

      // Act - make an actual API call to Azure DevOps
      const result = await listProjects(connection, options);

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(Array.isArray(result), true);
      assert.ok(result.length <= 2);

      // If we have projects, check for correct limit
      if (result.length > 0) {
        // Get all projects to compare
        const allProjects = await listProjects(connection);

        // If we have more than 2 total projects, pagination should have limited results
        if (allProjects.length > 2) {
          assert.strictEqual(result.length, 2);
          assert.ok(result.length < allProjects.length);
        }
      }
    });
  },
);

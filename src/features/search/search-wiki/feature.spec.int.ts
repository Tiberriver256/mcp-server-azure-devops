import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { searchWiki } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'searchWiki integration',
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

    void test('should search wiki content', async () => {
      // Search the wiki
      const result = await searchWiki(connection, {
        searchText: 'test',
        projectId: projectName,
        top: 10,
      });

      // Verify the result
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.count, undefined);
      assert.strictEqual(Array.isArray(result.results), true);
      if (result.results.length > 0) {
        assert.notStrictEqual(result.results[0].fileName, undefined);
        assert.notStrictEqual(result.results[0].path, undefined);
        assert.notStrictEqual(result.results[0].project, undefined);
      }
    });

    void test('should handle pagination correctly', async () => {
      // Get first page of results
      const page1 = await searchWiki(connection, {
        searchText: 'test', // Common word likely to have many results
        projectId: projectName,
        top: 5,
        skip: 0,
      });

      // Get second page of results
      const page2 = await searchWiki(connection, {
        searchText: 'test',
        projectId: projectName,
        top: 5,
        skip: 5,
      });

      // Verify pagination
      assert.notDeepStrictEqual(page1.results, page2.results);
    });

    void test('should handle filters correctly', async () => {
      // This test is more of a smoke test since we can't guarantee specific projects
      const result = await searchWiki(connection, {
        searchText: 'test',
        filters: {
          Project: [projectName],
        },
        includeFacets: true,
      });

      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.facets, undefined);
    });
  },
);

import { WebApi } from 'azure-devops-node-api';
import { searchWiki } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

describe('searchWiki integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
  });

  test('should search wiki content', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // Search the wiki
    const result = await searchWiki(connection, {
      searchText: 'test',
      projectId: projectName,
      top: 10,
    });

    // Verify the result
    expect(result).toBeDefined();
    expect(result.count).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
    if (result.results.length > 0) {
      expect(result.results[0].fileName).toBeDefined();
      expect(result.results[0].path).toBeDefined();
      expect(result.results[0].project).toBeDefined();
    }
  });

  test('should handle pagination correctly', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

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
    expect(page1.results).not.toEqual(page2.results);
  });

  test('should handle filters correctly', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // This test is more of a smoke test since we can't guarantee specific projects
    const result = await searchWiki(connection, {
      searchText: 'test',
      filters: {
        Project: [projectName],
      },
      includeFacets: true,
    });

    expect(result).toBeDefined();
    expect(result.facets).toBeDefined();
  });
});

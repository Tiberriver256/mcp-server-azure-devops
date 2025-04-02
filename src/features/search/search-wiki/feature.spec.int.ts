import { WebApi } from 'azure-devops-node-api';
import { searchWiki } from './feature';
import { getConnection } from '../../../server';
import { AzureDevOpsConfig } from '../../../shared/types';
import { AuthenticationMethod } from '../../../shared/auth';

// Skip tests if not in integration test environment
const runTests = process.env.RUN_INTEGRATION_TESTS === 'true';

// These tests require a valid Azure DevOps connection
// They are skipped by default and only run when RUN_INTEGRATION_TESTS is set
(runTests ? describe : describe.skip)('searchWiki (Integration)', () => {
  let connection: WebApi;
  const projectId = process.env.AZURE_DEVOPS_TEST_PROJECT || '';

  beforeAll(async () => {
    // Skip setup if tests are skipped
    if (!runTests) return;

    // Ensure we have required environment variables
    if (!process.env.AZURE_DEVOPS_ORG_URL) {
      throw new Error('AZURE_DEVOPS_ORG_URL environment variable is required');
    }

    if (!projectId) {
      throw new Error(
        'AZURE_DEVOPS_TEST_PROJECT environment variable is required',
      );
    }

    // Create connection
    const config: AzureDevOpsConfig = {
      organizationUrl: process.env.AZURE_DEVOPS_ORG_URL,
      authMethod:
        (process.env.AZURE_DEVOPS_AUTH_METHOD as AuthenticationMethod) ||
        AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: process.env.AZURE_DEVOPS_PAT,
    };

    connection = await getConnection(config);
  }, 30000);

  it('should search wiki pages with basic query', async () => {
    // Skip if tests are skipped
    if (!runTests) return;

    const result = await searchWiki(connection, {
      searchText: 'test',
      projectId,
      top: 10,
    });

    // Verify the structure of the response
    expect(result).toBeDefined();
    expect(typeof result.count).toBe('number');
    expect(Array.isArray(result.results)).toBe(true);

    // If there are results, verify their structure
    if (result.results.length > 0) {
      const firstResult = result.results[0];
      expect(firstResult.fileName).toBeDefined();
      expect(firstResult.path).toBeDefined();
      expect(firstResult.project).toBeDefined();
      expect(firstResult.wiki).toBeDefined();
      expect(Array.isArray(firstResult.hits)).toBe(true);
    }
  }, 30000);

  it('should handle pagination correctly', async () => {
    // Skip if tests are skipped
    if (!runTests) return;

    // Get first page of results
    const page1 = await searchWiki(connection, {
      searchText: 'the', // Common word likely to have many results
      projectId,
      top: 5,
      skip: 0,
    });

    // Get second page of results
    const page2 = await searchWiki(connection, {
      searchText: 'the',
      projectId,
      top: 5,
      skip: 5,
    });

    // Verify pagination works
    expect(page1.count).toBe(page2.count); // Total count should be the same

    // If there are enough results, verify pages are different
    if (page1.results.length === 5 && page2.results.length > 0) {
      // Check that the results are different by comparing paths
      const page1Paths = page1.results.map((r) => r.path);
      const page2Paths = page2.results.map((r) => r.path);

      // At least one result should be different
      expect(page2Paths.some((path) => !page1Paths.includes(path))).toBe(true);
    }
  }, 30000);

  it('should handle filters correctly', async () => {
    // Skip if tests are skipped
    if (!runTests) return;

    // This test is more of a smoke test since we can't guarantee specific projects
    const result = await searchWiki(connection, {
      searchText: 'test',
      projectId,
      filters: {
        Project: [projectId],
      },
      includeFacets: true,
    });

    // Verify the response has the expected structure
    expect(result).toBeDefined();
    expect(typeof result.count).toBe('number');

    // If facets were requested and returned, verify their structure
    if (result.facets && result.facets.Project) {
      expect(Array.isArray(result.facets.Project)).toBe(true);
      if (result.facets.Project.length > 0) {
        const facet = result.facets.Project[0];
        expect(facet.name).toBeDefined();
        expect(facet.id).toBeDefined();
        expect(typeof facet.resultCount).toBe('number');
      }
    }
  }, 30000);
});

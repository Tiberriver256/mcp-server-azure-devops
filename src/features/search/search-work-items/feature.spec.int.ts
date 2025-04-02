import { WebApi } from 'azure-devops-node-api';
import { searchWorkItems } from './feature';
import { getConnection } from '../../../server';
import { AzureDevOpsConfig } from '../../../shared/types';
import { AuthenticationMethod } from '../../../shared/auth';

// Skip tests if no PAT is available
const hasPat = process.env.AZURE_DEVOPS_PAT && process.env.AZURE_DEVOPS_ORG_URL;
const describeOrSkip = hasPat ? describe : describe.skip;

describeOrSkip('searchWorkItems (Integration)', () => {
  let connection: WebApi;
  let config: AzureDevOpsConfig;
  let projectId: string;

  beforeAll(async () => {
    // Set up the connection
    config = {
      organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: process.env.AZURE_DEVOPS_PAT || '',
      defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '',
    };

    connection = await getConnection(config);
    projectId = config.defaultProject || '';

    // Skip tests if no default project is set
    if (!projectId) {
      console.warn('Skipping integration tests: No default project set');
    }
  }, 30000);

  it('should search for work items', async () => {
    // Skip test if no default project
    if (!projectId) {
      return;
    }

    // Act
    const result = await searchWorkItems(connection, {
      searchText: 'test',
      projectId,
      top: 10,
      includeFacets: true,
    });

    // Assert
    expect(result).toBeDefined();
    expect(typeof result.count).toBe('number');
    expect(Array.isArray(result.results)).toBe(true);

    // If there are results, verify their structure
    if (result.results.length > 0) {
      const firstResult = result.results[0];
      expect(firstResult.project).toBeDefined();
      expect(firstResult.fields).toBeDefined();
      expect(firstResult.fields['system.id']).toBeDefined();
      expect(firstResult.fields['system.title']).toBeDefined();
      expect(firstResult.hits).toBeDefined();
      expect(firstResult.url).toBeDefined();
    }

    // If facets were requested, verify their structure
    if (result.facets) {
      expect(result.facets).toBeDefined();
    }
  }, 30000);

  it('should filter work items by type', async () => {
    // Skip test if no default project
    if (!projectId) {
      return;
    }

    // Act
    const result = await searchWorkItems(connection, {
      searchText: 'test',
      projectId,
      filters: {
        'System.WorkItemType': ['Bug'],
      },
      top: 10,
    });

    // Assert
    expect(result).toBeDefined();

    // If there are results, verify they are all bugs
    if (result.results.length > 0) {
      result.results.forEach((item) => {
        expect(item.fields['system.workitemtype'].toLowerCase()).toBe('bug');
      });
    }
  }, 30000);

  it('should support pagination', async () => {
    // Skip test if no default project
    if (!projectId) {
      return;
    }

    // Act - Get first page
    const firstPage = await searchWorkItems(connection, {
      searchText: 'test',
      projectId,
      top: 5,
      skip: 0,
    });

    // If there are enough results, test pagination
    if (firstPage.count > 5) {
      // Act - Get second page
      const secondPage = await searchWorkItems(connection, {
        searchText: 'test',
        projectId,
        top: 5,
        skip: 5,
      });

      // Assert
      expect(secondPage).toBeDefined();
      expect(secondPage.results).toBeDefined();

      // Verify the pages have different items
      if (firstPage.results.length > 0 && secondPage.results.length > 0) {
        const firstPageIds = firstPage.results.map(
          (r) => r.fields['system.id'],
        );
        const secondPageIds = secondPage.results.map(
          (r) => r.fields['system.id'],
        );

        // Check that the pages don't have overlapping IDs
        const overlap = firstPageIds.filter((id) => secondPageIds.includes(id));
        expect(overlap.length).toBe(0);
      }
    }
  }, 30000);

  it('should support sorting', async () => {
    // Skip test if no default project
    if (!projectId) {
      return;
    }

    // Act - Get results sorted by creation date (newest first)
    const result = await searchWorkItems(connection, {
      searchText: 'test',
      projectId,
      orderBy: [{ field: 'System.CreatedDate', sortOrder: 'DESC' }],
      top: 10,
    });

    // Assert
    expect(result).toBeDefined();

    // If there are multiple results, verify they are sorted
    if (result.results.length > 1) {
      const dates = result.results
        .filter((r) => r.fields['system.createddate'] !== undefined)
        .map((r) =>
          new Date(r.fields['system.createddate'] as string).getTime(),
        );

      // Check that dates are in descending order
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }
    }
  }, 30000);

  // Add a test to verify Azure Identity authentication if configured
  if (
    process.env.AZURE_DEVOPS_AUTH_METHOD?.toLowerCase() === 'azure-identity'
  ) {
    test('should search work items using Azure Identity authentication', async () => {
      // Skip if required environment variables are missing
      if (!process.env.AZURE_DEVOPS_ORG_URL || !process.env.TEST_PROJECT_ID) {
        console.log('Skipping test: required environment variables missing');
        return;
      }

      // Create a config with Azure Identity authentication
      const testConfig: AzureDevOpsConfig = {
        organizationUrl: process.env.AZURE_DEVOPS_ORG_URL,
        authMethod: AuthenticationMethod.AzureIdentity,
        defaultProject: process.env.TEST_PROJECT_ID,
      };

      // Create the connection using the config
      const connection = await getConnection(testConfig);

      // Search work items
      const result = await searchWorkItems(connection, {
        projectId: process.env.TEST_PROJECT_ID,
        searchText: 'test',
      });

      // Check that the response is properly formatted
      expect(result).toBeDefined();
      expect(result.count).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });
  }
});

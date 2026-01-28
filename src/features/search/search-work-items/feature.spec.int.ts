import { WebApi } from 'azure-devops-node-api';
import { searchWorkItems } from './feature';
import { getConnection } from '../../../server';
import { AzureDevOpsConfig } from '../../../shared/types';
import { AuthenticationMethod } from '../../../shared/auth';

// Skip tests if no PAT or default project is available
const hasPat = process.env.AZURE_DEVOPS_PAT && process.env.AZURE_DEVOPS_ORG_URL;
const projectId = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '';
const hasProjectId = Boolean(projectId);
const describeOrSkip = hasPat && hasProjectId ? describe : describe.skip;

describeOrSkip('searchWorkItems (Integration)', () => {
  let connection: WebApi;
  let config: AzureDevOpsConfig;

  beforeAll(async () => {
    // Set up the connection
    config = {
      organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: process.env.AZURE_DEVOPS_PAT || '',
      defaultProject: projectId,
    };

    connection = await getConnection(config);
  }, 30000);

  it('should search for work items', async () => {
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
    const azureIdentityOrgUrl = process.env.AZURE_DEVOPS_ORG_URL || '';
    const azureIdentityProjectId = process.env.TEST_PROJECT_ID || '';
    const azureIdentityTest =
      azureIdentityOrgUrl && azureIdentityProjectId ? test : test.skip;

    azureIdentityTest(
      'should search work items using Azure Identity authentication',
      async () => {
        // Create a config with Azure Identity authentication
        const testConfig: AzureDevOpsConfig = {
          organizationUrl: azureIdentityOrgUrl,
          authMethod: AuthenticationMethod.AzureIdentity,
          defaultProject: azureIdentityProjectId,
        };

        // Create the connection using the config
        const connection = await getConnection(testConfig);

        // Search work items
        const result = await searchWorkItems(connection, {
          projectId: azureIdentityProjectId,
          searchText: 'test',
        });

        // Check that the response is properly formatted
        expect(result).toBeDefined();
        expect(result.count).toBeDefined();
        expect(Array.isArray(result.results)).toBe(true);
      },
    );
  }
});

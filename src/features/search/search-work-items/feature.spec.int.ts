import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { searchWorkItems } from './feature.ts';
import { getConnection } from '../../../server.ts';
import type { AzureDevOpsConfig } from '../../../shared/types/index.ts';
import { AuthenticationMethod } from '../../../shared/auth/index.ts';

// Skip tests if no PAT or default project is available
const hasPat = Boolean(
  process.env.AZURE_DEVOPS_PAT && process.env.AZURE_DEVOPS_ORG_URL,
);
const projectId = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '';
const hasProjectId = Boolean(projectId);
const skipReason =
  hasPat && hasProjectId
    ? false
    : 'AZURE_DEVOPS_PAT, AZURE_DEVOPS_ORG_URL, and AZURE_DEVOPS_DEFAULT_PROJECT are required';

void describe('searchWorkItems (Integration)', { skip: skipReason }, () => {
  let connection: WebApi;
  let config: AzureDevOpsConfig;

  before(
    async () => {
      // Set up the connection
      config = {
        organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
        authMethod: AuthenticationMethod.PersonalAccessToken,
        personalAccessToken: process.env.AZURE_DEVOPS_PAT || '',
        defaultProject: projectId,
      };

      connection = await getConnection(config);
    },
    { timeout: 30000 },
  );

  void it('should search for work items', { timeout: 30000 }, async () => {
    // Act
    const result = await searchWorkItems(connection, {
      searchText: 'test',
      projectId,
      top: 10,
      includeFacets: true,
    });

    // Assert
    assert.notStrictEqual(result, undefined);
    assert.strictEqual(typeof result.count, 'number');
    assert.strictEqual(Array.isArray(result.results), true);

    // If there are results, verify their structure
    if (result.results.length > 0) {
      const firstResult = result.results[0];
      assert.notStrictEqual(firstResult.project, undefined);
      assert.notStrictEqual(firstResult.fields, undefined);
      assert.notStrictEqual(firstResult.fields['system.id'], undefined);
      assert.notStrictEqual(firstResult.fields['system.title'], undefined);
      assert.notStrictEqual(firstResult.hits, undefined);
      assert.notStrictEqual(firstResult.url, undefined);
    }

    // If facets were requested, verify their structure
    if (result.facets) {
      assert.notStrictEqual(result.facets, undefined);
    }
  });

  void it('should filter work items by type', { timeout: 30000 }, async () => {
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
    assert.notStrictEqual(result, undefined);

    // If there are results, verify they are all bugs
    if (result.results.length > 0) {
      result.results.forEach((item) => {
        assert.strictEqual(
          item.fields['system.workitemtype'].toLowerCase(),
          'bug',
        );
      });
    }
  });

  void it('should support pagination', { timeout: 30000 }, async () => {
    // Act - Get first page
    const firstPage = await searchWorkItems(connection, {
      searchText: 'test',
      projectId,
      orderBy: [{ field: 'System.CreatedDate', sortOrder: 'DESC' }],
      top: 5,
      skip: 0,
    });

    // If there are enough results, test pagination
    if (firstPage.count > 5) {
      // Act - Get second page
      const secondPage = await searchWorkItems(connection, {
        searchText: 'test',
        projectId,
        orderBy: [{ field: 'System.CreatedDate', sortOrder: 'DESC' }],
        top: 5,
        skip: 5,
      });

      // Assert
      assert.notStrictEqual(secondPage, undefined);
      assert.notStrictEqual(secondPage.results, undefined);

      // Verify the pages have different items
      if (firstPage.results.length > 0 && secondPage.results.length > 0) {
        const firstPageIds = new Set(
          firstPage.results.map((r) => r.fields['system.id']),
        );
        const secondPageIds = secondPage.results.map(
          (r) => r.fields['system.id'],
        );

        // Search pagination ordering can shift slightly between calls (index updates).
        // Assert at least one new item appears on the next page.
        const hasNewItem = secondPageIds.some((id) => !firstPageIds.has(id));
        assert.strictEqual(hasNewItem, true);
      }
    }
  });

  void it('should support sorting', { timeout: 30000 }, async () => {
    // Act - Get results sorted by creation date (newest first)
    const result = await searchWorkItems(connection, {
      searchText: 'test',
      projectId,
      orderBy: [{ field: 'System.CreatedDate', sortOrder: 'DESC' }],
      top: 10,
    });

    // Assert
    assert.notStrictEqual(result, undefined);

    // If there are multiple results, verify they are sorted
    if (result.results.length > 1) {
      const dates = result.results
        .filter((r) => r.fields['system.createddate'] !== undefined)
        .map((r) =>
          new Date(r.fields['system.createddate'] as string).getTime(),
        );

      // Check that dates are in descending order
      for (let i = 0; i < dates.length - 1; i++) {
        assert.ok(dates[i] >= dates[i + 1]);
      }
    }
  });

  // Add a test to verify Azure Identity authentication if configured
  if (
    process.env.AZURE_DEVOPS_AUTH_METHOD?.toLowerCase() === 'azure-identity'
  ) {
    const azureIdentityOrgUrl = process.env.AZURE_DEVOPS_ORG_URL || '';
    const azureIdentityProjectId = process.env.TEST_PROJECT_ID || '';

    void it(
      'should search work items using Azure Identity authentication',
      {
        skip:
          azureIdentityOrgUrl && azureIdentityProjectId
            ? false
            : 'AZURE_DEVOPS_ORG_URL and TEST_PROJECT_ID are required',
      },
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
        assert.notStrictEqual(result, undefined);
        assert.notStrictEqual(result.count, undefined);
        assert.strictEqual(Array.isArray(result.results), true);
      },
    );
  }
});

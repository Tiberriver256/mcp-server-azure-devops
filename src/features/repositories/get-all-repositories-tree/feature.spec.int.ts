import { getConnection } from '../../../server';
import { shouldSkipIntegrationTest } from '../../../shared/test/test-helpers';
import { getAllRepositoriesTree } from './feature';
import { AzureDevOpsConfig } from '../../../shared/types';
import { WebApi } from 'azure-devops-node-api';
import { AuthenticationMethod } from '../../../shared/auth';

// Skip tests if no PAT is available
const hasPat = process.env.AZURE_DEVOPS_PAT && process.env.AZURE_DEVOPS_ORG_URL;
const describeOrSkip = hasPat ? describe : describe.skip;

describeOrSkip('getAllRepositoriesTree (Integration)', () => {
  let connection: WebApi;
  let config: AzureDevOpsConfig;
  let projectId: string;
  let orgId: string;

  beforeAll(async () => {
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // Configuration values
    config = {
      organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: process.env.AZURE_DEVOPS_PAT || '',
      defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '',
    };

    // Use test project - should be defined in .env file
    projectId =
      process.env.AZURE_DEVOPS_TEST_PROJECT_ID ||
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT ||
      '';

    // Extract organization ID from URL
    const url = new URL(config.organizationUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    orgId = pathParts[0] || '';

    // Get Azure DevOps connection
    connection = await getConnection(config);

    // Skip tests if no project ID is set
    if (!projectId) {
      console.warn('Skipping integration tests: No test project ID set');
    }
  }, 30000);

  // Skip all tests if integration tests are disabled
  beforeEach(() => {
    if (shouldSkipIntegrationTest()) {
      jest.resetAllMocks();
      return;
    }
  });

  it('should retrieve tree for all repositories with maximum depth (default)', async () => {
    // Skip test if no project ID or if integration tests are disabled
    if (shouldSkipIntegrationTest() || !projectId) {
      return;
    }

    const result = await getAllRepositoriesTree(connection, {
      organizationId: orgId,
      projectId: projectId,
      // depth defaults to 0 (unlimited)
    });

    expect(result).toBeDefined();
    expect(result.repositories).toBeDefined();
    expect(Array.isArray(result.repositories)).toBe(true);
    expect(result.repositories.length).toBeGreaterThan(0);

    // Check that at least one repository has a tree
    const repoWithTree = result.repositories.find((r) => r.tree.length > 0);
    expect(repoWithTree).toBeDefined();

    if (repoWithTree) {
      // Verify that deep nesting is included (finding items with level > 2)
      // Note: This might not always be true depending on repos, but there should be at least some nested items
      const deepItems = repoWithTree.tree.filter((item) => item.level > 2);
      expect(deepItems.length).toBeGreaterThan(0);

      // Verify stats are correct
      expect(repoWithTree.stats.directories).toBeGreaterThanOrEqual(0);
      expect(repoWithTree.stats.files).toBeGreaterThan(0);
      const dirCount = repoWithTree.tree.filter((item) => item.isFolder).length;
      const fileCount = repoWithTree.tree.filter(
        (item) => !item.isFolder,
      ).length;
      expect(repoWithTree.stats.directories).toBe(dirCount);
      expect(repoWithTree.stats.files).toBe(fileCount);
    }
  }, 60000); // Longer timeout because max depth can take time

  it('should retrieve tree for all repositories with limited depth (depth=1)', async () => {
    // Skip test if no project ID or if integration tests are disabled
    if (shouldSkipIntegrationTest() || !projectId) {
      return;
    }

    const result = await getAllRepositoriesTree(connection, {
      organizationId: orgId,
      projectId: projectId,
      depth: 1, // Only 1 level deep
    });

    expect(result).toBeDefined();
    expect(result.repositories).toBeDefined();
    expect(Array.isArray(result.repositories)).toBe(true);
    expect(result.repositories.length).toBeGreaterThan(0);

    // Check that at least one repository has a tree
    const repoWithTree = result.repositories.find((r) => r.tree.length > 0);
    expect(repoWithTree).toBeDefined();

    if (repoWithTree) {
      // Verify that only shallow nesting is included (all items should have level = 1)
      const allItemsLevel1 = repoWithTree.tree.every(
        (item) => item.level === 1,
      );
      expect(allItemsLevel1).toBe(true);

      // Verify stats are correct
      expect(repoWithTree.stats.directories).toBeGreaterThanOrEqual(0);
      expect(repoWithTree.stats.files).toBeGreaterThanOrEqual(0);
      const dirCount = repoWithTree.tree.filter((item) => item.isFolder).length;
      const fileCount = repoWithTree.tree.filter(
        (item) => !item.isFolder,
      ).length;
      expect(repoWithTree.stats.directories).toBe(dirCount);
      expect(repoWithTree.stats.files).toBe(fileCount);
    }
  }, 30000);
});

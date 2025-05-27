import { listWikiPages, WikiPageSummary } from './feature';
import { getWikis } from '../get-wikis/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { getOrgNameFromUrl } from '@/utils/environment';
import { AzureDevOpsError } from '@/shared/errors/azure-devops-errors';

// Ensure environment variables are set for testing
process.env.AZURE_DEVOPS_DEFAULT_PROJECT =
  process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'default-project';

describe('listWikiPages integration', () => {
  let projectName: string;
  let orgUrl: string;
  let organizationId: string;

  beforeAll(async () => {
    // Mock the required environment variable for testing
    process.env.AZURE_DEVOPS_ORG_URL =
      process.env.AZURE_DEVOPS_ORG_URL || 'https://example.visualstudio.com';

    // Get and validate required environment variables
    const envProjectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT;
    if (!envProjectName) {
      throw new Error(
        'AZURE_DEVOPS_DEFAULT_PROJECT environment variable is required',
      );
    }
    projectName = envProjectName;

    const envOrgUrl = process.env.AZURE_DEVOPS_ORG_URL;
    if (!envOrgUrl) {
      throw new Error('AZURE_DEVOPS_ORG_URL environment variable is required');
    }
    orgUrl = envOrgUrl;
    organizationId = getOrgNameFromUrl(orgUrl);
  });

  describe('Happy Path Tests', () => {
    test('should list pages in real test wiki', async () => {
      // Skip if no connection available
      if (shouldSkipIntegrationTest()) {
        return;
      }

      // Get a real connection using environment variables
      const connection = await getTestConnection();
      if (!connection) {
        throw new Error(
          'Connection should be available when test is not skipped',
        );
      }

      // First get available wikis
      const wikis = await getWikis(connection, { projectId: projectName });

      // Skip if no wikis are available
      if (wikis.length === 0) {
        console.log('Skipping test: No wikis available in the project');
        return;
      }

      // Use the first available wiki
      const wiki = wikis[0];
      if (!wiki.name) {
        throw new Error('Wiki name is undefined');
      }

      // List wiki pages
      const result = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wiki.name,
      });

      // Verify the result structure
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // If pages exist, verify their structure matches WikiPageSummary interface
      if (result.length > 0) {
        const page = result[0];
        expect(page).toHaveProperty('id');
        expect(page).toHaveProperty('path');
        expect(page).toHaveProperty('url');
        expect(typeof page.id).toBe('number');
        expect(typeof page.path).toBe('string');
        // url and order are optional
        if (page.url !== undefined) {
          expect(typeof page.url).toBe('string');
        }
        if (page.order !== undefined) {
          expect(typeof page.order).toBe('number');
        }
      }
    });

    test('should handle path filtering with real wiki structure', async () => {
      // Skip if integration tests are disabled or no connection available
      if (shouldSkipIntegrationTest()) {
        return;
      }

      // Get a real connection using environment variables
      const connection = await getTestConnection();
      if (!connection) {
        throw new Error(
          'Connection should be available when test is not skipped',
        );
      }

      // First get available wikis
      const wikis = await getWikis(connection, { projectId: projectName });

      // Skip if no wikis are available
      if (wikis.length === 0) {
        console.log('Skipping test: No wikis available in the project');
        return;
      }

      // Use the first available wiki
      const wiki = wikis[0];
      if (!wiki.name) {
        throw new Error('Wiki name is undefined');
      }

      // First get all pages to find a valid path
      const allPages = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wiki.name,
      });

      // If we have pages, test filtering by path
      if (allPages.length > 0) {
        // Try to find a page with a nested path
        const nestedPage = allPages.find((page) => page.path.includes('/'));

        if (nestedPage) {
          // Extract parent path
          const pathParts = nestedPage.path.split('/');
          const parentPath = pathParts.slice(0, -1).join('/');

          if (parentPath) {
            // Test filtering by parent path
            const filteredResult = await listWikiPages({
              organizationId,
              projectId: projectName,
              wikiId: wiki.name,
              path: parentPath,
            });

            expect(Array.isArray(filteredResult)).toBe(true);
            // All returned pages should be under the specified path
            filteredResult.forEach((page) => {
              expect(page.path.startsWith(parentPath)).toBe(true);
            });
          }
        }
      }
    });

    test('should handle recursionLevel parameter with various values', async () => {
      // Skip if integration tests are disabled or no connection available
      if (shouldSkipIntegrationTest()) {
        return;
      }

      // Get a real connection using environment variables
      const connection = await getTestConnection();
      if (!connection) {
        throw new Error(
          'Connection should be available when test is not skipped',
        );
      }

      // First get available wikis
      const wikis = await getWikis(connection, { projectId: projectName });

      // Skip if no wikis are available
      if (wikis.length === 0) {
        console.log('Skipping test: No wikis available in the project');
        return;
      }

      // Use the first available wiki
      const wiki = wikis[0];
      if (!wiki.name) {
        throw new Error('Wiki name is undefined');
      }

      // Test with recursionLevel 1 (shallow)
      const shallowResult = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wiki.name,
        recursionLevel: 1,
      });

      expect(Array.isArray(shallowResult)).toBe(true);

      // Test with recursionLevel 5 (deeper)
      const deeperResult = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wiki.name,
        recursionLevel: 5,
      });

      expect(Array.isArray(deeperResult)).toBe(true);

      // Deeper recursion should return same or more pages
      expect(deeperResult.length).toBeGreaterThanOrEqual(shallowResult.length);
    });
  });

  describe('Error Scenarios', () => {
    test('should handle invalid wikiId (expect 404 error)', async () => {
      // Skip if integration tests are disabled or no connection available
      if (shouldSkipIntegrationTest()) {
        return;
      }

      const invalidWikiId = 'non-existent-wiki-id-12345';

      await expect(
        listWikiPages({
          organizationId,
          projectId: projectName,
          wikiId: invalidWikiId,
        }),
      ).rejects.toThrow(AzureDevOpsError);
    });

    test('should handle invalid projectId', async () => {
      // Skip if integration tests are disabled or no connection available
      if (shouldSkipIntegrationTest()) {
        return;
      }

      const invalidProjectId = 'non-existent-project-12345';

      await expect(
        listWikiPages({
          organizationId,
          projectId: invalidProjectId,
          wikiId: 'any-wiki',
        }),
      ).rejects.toThrow(AzureDevOpsError);
    });

    test('should handle invalid organizationId', async () => {
      // Skip if integration tests are disabled or no connection available
      if (shouldSkipIntegrationTest()) {
        return;
      }

      const invalidOrgId = 'non-existent-org-12345';

      await expect(
        listWikiPages({
          organizationId: invalidOrgId,
          projectId: projectName,
          wikiId: 'any-wiki',
        }),
      ).rejects.toThrow(AzureDevOpsError);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty wikis gracefully', async () => {
      // Skip if integration tests are disabled or no connection available
      if (shouldSkipIntegrationTest()) {
        return;
      }

      // Get a real connection using environment variables
      const connection = await getTestConnection();
      if (!connection) {
        throw new Error(
          'Connection should be available when test is not skipped',
        );
      }

      // First get available wikis
      const wikis = await getWikis(connection, { projectId: projectName });

      // Skip if no wikis are available
      if (wikis.length === 0) {
        console.log('Skipping test: No wikis available in the project');
        return;
      }

      // Use the first available wiki
      const wiki = wikis[0];
      if (!wiki.name) {
        throw new Error('Wiki name is undefined');
      }

      // Test with a path that likely doesn't exist
      const result = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wiki.name,
        path: '/non-existent-path-12345',
      });

      // Should return an array (may be empty or contain all pages depending on API behavior)
      expect(Array.isArray(result)).toBe(true);
      // Note: Azure DevOps API may return all pages when path doesn't match
      console.log(`Path filter test returned ${result.length} pages`);
    });

    test('should handle deeply nested paths', async () => {
      // Skip if integration tests are disabled or no connection available
      if (shouldSkipIntegrationTest()) {
        return;
      }

      // Get a real connection using environment variables
      const connection = await getTestConnection();
      if (!connection) {
        throw new Error(
          'Connection should be available when test is not skipped',
        );
      }

      // First get available wikis
      const wikis = await getWikis(connection, { projectId: projectName });

      // Skip if no wikis are available
      if (wikis.length === 0) {
        console.log('Skipping test: No wikis available in the project');
        return;
      }

      // Use the first available wiki
      const wiki = wikis[0];
      if (!wiki.name) {
        throw new Error('Wiki name is undefined');
      }

      // Test with maximum recursion level
      const result = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wiki.name,
        recursionLevel: 50, // Maximum allowed
      });

      expect(Array.isArray(result)).toBe(true);
      // Should not throw error even with max recursion
    });

    test('should handle boundary recursionLevel values', async () => {
      // Skip if integration tests are disabled or no connection available
      if (shouldSkipIntegrationTest()) {
        return;
      }

      // Get a real connection using environment variables
      const connection = await getTestConnection();
      if (!connection) {
        throw new Error(
          'Connection should be available when test is not skipped',
        );
      }

      // First get available wikis
      const wikis = await getWikis(connection, { projectId: projectName });

      // Skip if no wikis are available
      if (wikis.length === 0) {
        console.log('Skipping test: No wikis available in the project');
        return;
      }

      // Use the first available wiki
      const wiki = wikis[0];
      if (!wiki.name) {
        throw new Error('Wiki name is undefined');
      }

      // Test minimum recursion level
      const minResult = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wiki.name,
        recursionLevel: 1,
      });

      expect(Array.isArray(minResult)).toBe(true);

      // Test maximum recursion level
      const maxResult = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wiki.name,
        recursionLevel: 50,
      });

      expect(Array.isArray(maxResult)).toBe(true);
    });
  });

  describe('Data Structure Validation', () => {
    test('should verify returned data structure matches WikiPageSummary interface', async () => {
      // Skip if integration tests are disabled or no connection available
      if (shouldSkipIntegrationTest()) {
        return;
      }

      // Get a real connection using environment variables
      const connection = await getTestConnection();
      if (!connection) {
        throw new Error(
          'Connection should be available when test is not skipped',
        );
      }

      // First get available wikis
      const wikis = await getWikis(connection, { projectId: projectName });

      // Skip if no wikis are available
      if (wikis.length === 0) {
        console.log('Skipping test: No wikis available in the project');
        return;
      }

      // Use the first available wiki
      const wiki = wikis[0];
      if (!wiki.name) {
        throw new Error('Wiki name is undefined');
      }

      const result = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wiki.name,
      });

      expect(Array.isArray(result)).toBe(true);

      // Validate each page in the result
      result.forEach((page: WikiPageSummary) => {
        // Required fields
        expect(page).toHaveProperty('id');
        expect(page).toHaveProperty('path');
        expect(page).toHaveProperty('url');

        expect(typeof page.id).toBe('number');
        expect(typeof page.path).toBe('string');

        // Optional fields
        if (page.url !== undefined) {
          expect(typeof page.url).toBe('string');
        }
        if (page.order !== undefined) {
          expect(typeof page.order).toBe('number');
        }

        // Validate URL format (if present)
        if (page.url !== undefined) {
          expect(page.url).toMatch(/^https?:\/\//);
        }

        // Validate path format (should start with /)
        expect(page.path).toMatch(/^\//);
      });
    });
  });

  describe('Performance and Pagination', () => {
    test('should handle large wiki structures efficiently', async () => {
      // Skip if integration tests are disabled or no connection available
      if (shouldSkipIntegrationTest()) {
        return;
      }

      // Get a real connection using environment variables
      const connection = await getTestConnection();
      if (!connection) {
        throw new Error(
          'Connection should be available when test is not skipped',
        );
      }

      // First get available wikis
      const wikis = await getWikis(connection, { projectId: projectName });

      // Skip if no wikis are available
      if (wikis.length === 0) {
        console.log('Skipping test: No wikis available in the project');
        return;
      }

      // Use the first available wiki
      const wiki = wikis[0];
      if (!wiki.name) {
        throw new Error('Wiki name is undefined');
      }

      const startTime = Date.now();

      const result = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wiki.name,
        recursionLevel: 50, // Maximum depth to test performance
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(Array.isArray(result)).toBe(true);

      // Performance check - should complete within reasonable time (30 seconds)
      expect(duration).toBeLessThan(30000);

      console.log(`Retrieved ${result.length} pages in ${duration}ms`);
    });
  });
});

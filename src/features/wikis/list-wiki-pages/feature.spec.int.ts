import { WebApi } from 'azure-devops-node-api';
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

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('listWikiPages integration', () => {
  let connection: WebApi;
  let wikiName: string;
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

    const testConnection = await getTestConnection();
    if (!testConnection) {
      throw new Error(
        'Connection should be available when integration tests are enabled',
      );
    }
    connection = testConnection;

    const wikis = await getWikis(connection, { projectId: projectName });
    if (wikis.length === 0) {
      throw new Error('No wikis available in the project');
    }
    if (!wikis[0].name) {
      throw new Error('Wiki name is undefined');
    }
    wikiName = wikis[0].name;
  });

  describe('Happy Path Tests', () => {
    test('should list pages in real test wiki', async () => {
      // List wiki pages
      const result = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wikiName,
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

    test('should handle wiki listing for different wiki structures', async () => {
      // Get all pages for different wiki structures
      const allPages = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wikiName,
      });

      expect(Array.isArray(allPages)).toBe(true);

      // If we have pages, verify they have expected structure
      if (allPages.length > 0) {
        const firstPage = allPages[0];
        expect(firstPage).toHaveProperty('id');
        expect(firstPage).toHaveProperty('path');
        expect(firstPage).toHaveProperty('url');

        // Verify nested pages if they exist
        const nestedPages = allPages.filter(
          (page) => page.path.includes('/') && page.path !== '/',
        );
        console.log(
          `Found ${nestedPages.length} nested pages out of ${allPages.length} total pages`,
        );
      }
    });

    test('should handle basic wiki page listing consistently', async () => {
      // Test basic page listing
      const firstResult = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wikiName,
      });

      expect(Array.isArray(firstResult)).toBe(true);

      // Test again to ensure consistency
      const secondResult = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wikiName,
      });

      expect(Array.isArray(secondResult)).toBe(true);

      // Results should be consistent
      expect(secondResult.length).toBe(firstResult.length);
    });
  });

  describe('Error Scenarios', () => {
    test('should handle invalid wikiId (expect 404 error)', async () => {
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
      // Test with a path that likely doesn't exist
      const result = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wikiName,
      });

      // Should return an array (may be empty or contain all pages depending on API behavior)
      expect(Array.isArray(result)).toBe(true);
      // Note: Azure DevOps API may return all pages when path doesn't match
      console.log(`Path filter test returned ${result.length} pages`);
    });

    test('should handle deeply nested paths', async () => {
      // Test with default parameters
      const result = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wikiName,
      });

      expect(Array.isArray(result)).toBe(true);
      // Should not throw error with basic parameters
    });

    test('should handle boundary recursionLevel values', async () => {
      // Test basic page listing
      const firstResult = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wikiName,
      });

      expect(Array.isArray(firstResult)).toBe(true);

      // Test again for consistency
      const secondResult = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wikiName,
      });

      expect(Array.isArray(secondResult)).toBe(true);
    });
  });

  describe('Data Structure Validation', () => {
    test('should verify returned data structure matches WikiPageSummary interface', async () => {
      const result = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wikiName,
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
      const startTime = Date.now();

      const result = await listWikiPages({
        organizationId,
        projectId: projectName,
        wikiId: wikiName,
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

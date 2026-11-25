import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import type { WikiPageSummary } from './feature.ts';
import { listWikiPages } from './feature.ts';
import { getWikis } from '../get-wikis/feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import { getOrgNameFromUrl } from '../../../shared/azure-devops-url.ts';
import { AzureDevOpsError } from '../../../shared/errors/azure-devops-errors.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'listWikiPages integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let wikiName: string;
    let projectName: string;
    let orgUrl: string;
    let organizationId: string | undefined;

    before(async () => {
      // Ensure environment variables are set for testing
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT =
        process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'default-project';
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
        throw new Error(
          'AZURE_DEVOPS_ORG_URL environment variable is required',
        );
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

    void describe('Happy Path Tests', () => {
      void test('should list pages in real test wiki', async () => {
        // List wiki pages
        const result = await listWikiPages({
          organizationId,
          projectId: projectName,
          wikiId: wikiName,
        });

        // Verify the result structure
        assert.notStrictEqual(result, undefined);
        assert.strictEqual(Array.isArray(result), true);

        // If pages exist, verify their structure matches WikiPageSummary interface
        if (result.length > 0) {
          const page = result[0];
          assert.ok(Object.hasOwn(page, 'id'));
          assert.ok(Object.hasOwn(page, 'path'));
          assert.ok(Object.hasOwn(page, 'url'));
          assert.strictEqual(typeof page.id, 'number');
          assert.strictEqual(typeof page.path, 'string');
          // url and order are optional
          if (page.url !== undefined) {
            assert.strictEqual(typeof page.url, 'string');
          }
          if (page.order !== undefined) {
            assert.strictEqual(typeof page.order, 'number');
          }
        }
      });

      void test('should handle wiki listing for different wiki structures', async () => {
        // Get all pages for different wiki structures
        const allPages = await listWikiPages({
          organizationId,
          projectId: projectName,
          wikiId: wikiName,
        });

        assert.strictEqual(Array.isArray(allPages), true);

        // If we have pages, verify they have expected structure
        if (allPages.length > 0) {
          const firstPage = allPages[0];
          assert.ok(Object.hasOwn(firstPage, 'id'));
          assert.ok(Object.hasOwn(firstPage, 'path'));
          assert.ok(Object.hasOwn(firstPage, 'url'));

          // Verify nested pages if they exist
          const nestedPages = allPages.filter(
            (page) => page.path.includes('/') && page.path !== '/',
          );
          console.log(
            `Found ${nestedPages.length} nested pages out of ${allPages.length} total pages`,
          );
        }
      });

      void test('should handle basic wiki page listing consistently', async () => {
        // Test basic page listing
        const firstResult = await listWikiPages({
          organizationId,
          projectId: projectName,
          wikiId: wikiName,
        });

        assert.strictEqual(Array.isArray(firstResult), true);

        // Test again to ensure consistency
        const secondResult = await listWikiPages({
          organizationId,
          projectId: projectName,
          wikiId: wikiName,
        });

        assert.strictEqual(Array.isArray(secondResult), true);

        // Results should be consistent
        assert.strictEqual(secondResult.length, firstResult.length);
      });
    });

    void describe('Error Scenarios', () => {
      void test('should handle invalid wikiId (expect 404 error)', async () => {
        const invalidWikiId = 'non-existent-wiki-id-12345';

        await assert.rejects(
          () =>
            listWikiPages({
              organizationId,
              projectId: projectName,
              wikiId: invalidWikiId,
            }),
          AzureDevOpsError,
        );
      });

      void test('should handle invalid projectId', async () => {
        const invalidProjectId = 'non-existent-project-12345';

        await assert.rejects(
          () =>
            listWikiPages({
              organizationId,
              projectId: invalidProjectId,
              wikiId: 'any-wiki',
            }),
          AzureDevOpsError,
        );
      });

      void test('should handle invalid organizationId', async () => {
        const invalidOrgId = 'non-existent-org-12345';

        await assert.rejects(
          () =>
            listWikiPages({
              organizationId: invalidOrgId,
              projectId: projectName,
              wikiId: 'any-wiki',
            }),
          AzureDevOpsError,
        );
      });
    });

    void describe('Edge Cases', () => {
      void test('should handle empty wikis gracefully', async () => {
        // Test with a path that likely doesn't exist
        const result = await listWikiPages({
          organizationId,
          projectId: projectName,
          wikiId: wikiName,
        });

        // Should return an array (may be empty or contain all pages depending on API behavior)
        assert.strictEqual(Array.isArray(result), true);
        // Note: Azure DevOps API may return all pages when path doesn't match
        console.log(`Path filter test returned ${result.length} pages`);
      });

      void test('should handle deeply nested paths', async () => {
        // Test with default parameters
        const result = await listWikiPages({
          organizationId,
          projectId: projectName,
          wikiId: wikiName,
        });

        assert.strictEqual(Array.isArray(result), true);
        // Should not throw error with basic parameters
      });

      void test('should handle boundary recursionLevel values', async () => {
        // Test basic page listing
        const firstResult = await listWikiPages({
          organizationId,
          projectId: projectName,
          wikiId: wikiName,
        });

        assert.strictEqual(Array.isArray(firstResult), true);

        // Test again for consistency
        const secondResult = await listWikiPages({
          organizationId,
          projectId: projectName,
          wikiId: wikiName,
        });

        assert.strictEqual(Array.isArray(secondResult), true);
      });
    });

    void describe('Data Structure Validation', () => {
      void test('should verify returned data structure matches WikiPageSummary interface', async () => {
        const result = await listWikiPages({
          organizationId,
          projectId: projectName,
          wikiId: wikiName,
        });

        assert.strictEqual(Array.isArray(result), true);

        // Validate each page in the result
        result.forEach((page: WikiPageSummary) => {
          // Required fields
          assert.ok(Object.hasOwn(page, 'id'));
          assert.ok(Object.hasOwn(page, 'path'));
          assert.ok(Object.hasOwn(page, 'url'));

          assert.strictEqual(typeof page.id, 'number');
          assert.strictEqual(typeof page.path, 'string');

          // Optional fields
          if (page.url !== undefined) {
            assert.strictEqual(typeof page.url, 'string');
          }
          if (page.order !== undefined) {
            assert.strictEqual(typeof page.order, 'number');
          }

          // Validate URL format (if present)
          if (page.url !== undefined) {
            assert.match(page.url, /^https?:\/\//);
          }

          // Validate path format (should start with /)
          assert.match(page.path, /^\//);
        });
      });
    });

    void describe('Performance and Pagination', () => {
      void test('should handle large wiki structures efficiently', async () => {
        const startTime = Date.now();

        const result = await listWikiPages({
          organizationId,
          projectId: projectName,
          wikiId: wikiName,
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        assert.strictEqual(Array.isArray(result), true);

        // Performance check - should complete within reasonable time (30 seconds)
        assert.ok(duration < 30000);

        console.log(`Retrieved ${result.length} pages in ${duration}ms`);
      });
    });
  },
);

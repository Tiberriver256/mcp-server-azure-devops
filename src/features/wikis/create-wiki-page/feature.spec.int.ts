import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { createWikiPage } from './feature.ts';
import type { CreateWikiPageSchema } from '../schemas.ts';
import { getWikiPage } from '../get-wiki-page/feature.ts';
import { getWikis } from '../get-wikis/feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import { getOrgNameFromUrl } from '../../../shared/azure-devops-url.ts';
import { AzureDevOpsError } from '../../../shared/errors/azure-devops-errors.ts';
import type { z } from 'zod';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'createWikiPage Integration Tests',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let projectName: string;
    let orgUrl: string;
    let organizationId: string | undefined;
    const testPagePath = '/IntegrationTestPage';
    const testPagePathSub = '/IntegrationTestPage/SubPage';
    const testPagePathDefault = '/DefaultPathPage';
    const testPagePathComment = '/CommentTestPage';

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

      // Get a real connection using environment variables
      const testConnection = await getTestConnection();
      if (!testConnection) {
        throw new Error(
          'Connection should be available when integration tests are enabled',
        );
      }
      connection = testConnection;
    });

    // Helper function to get a valid wiki ID
    async function getValidWikiId(): Promise<string> {
      const wikis = await getWikis(connection, { projectId: projectName });
      if (wikis.length === 0) {
        throw new Error('No wikis available in the project');
      }

      const wiki = wikis[0];
      if (!wiki.name) {
        throw new Error('Wiki name is undefined');
      }

      return wiki.name;
    }

    void test('should create a new wiki page at the root', async () => {
      // Get a valid wiki ID
      const wikiId = await getValidWikiId();

      const params: z.infer<typeof CreateWikiPageSchema> = {
        organizationId,
        projectId: projectName,
        wikiId,
        pagePath: testPagePath,
        content: 'This is content for the integration test page (root).',
      };

      try {
        // Create the wiki page
        const createdPage = await createWikiPage(params);

        // Verify the result
        assert.notStrictEqual(createdPage, undefined);
        assert.strictEqual(createdPage.path, testPagePath);
        assert.strictEqual(createdPage.content, params.content);

        // Verify by fetching the page
        const fetchedPage = await getWikiPage({
          organizationId,
          projectId: projectName,
          wikiId,
          pagePath: testPagePath,
        });

        assert.notStrictEqual(fetchedPage, undefined);
        assert.strictEqual(typeof fetchedPage, 'string');
        assert.ok(fetchedPage.includes(params.content));
      } catch (error) {
        console.error('Error in test:', error);
        throw error;
      }
    });

    void test('should create a new wiki sub-page', async () => {
      // Get a valid wiki ID
      const wikiId = await getValidWikiId();

      // First, ensure the parent page exists
      const parentParams: z.infer<typeof CreateWikiPageSchema> = {
        organizationId,
        projectId: projectName,
        wikiId,
        pagePath: testPagePath,
        content: 'This is the parent page for the sub-page test.',
      };

      try {
        // Create the parent page
        await createWikiPage(parentParams);

        // Now create the sub-page
        const subPageParams: z.infer<typeof CreateWikiPageSchema> = {
          organizationId,
          projectId: projectName,
          wikiId,
          pagePath: testPagePathSub,
          content: 'This is content for the integration test sub-page.',
        };

        const createdSubPage = await createWikiPage(subPageParams);

        // Verify the result
        assert.notStrictEqual(createdSubPage, undefined);
        assert.strictEqual(createdSubPage.path, testPagePathSub);
        assert.strictEqual(createdSubPage.content, subPageParams.content);

        // Verify by fetching the sub-page
        const fetchedSubPage = await getWikiPage({
          organizationId,
          projectId: projectName,
          wikiId,
          pagePath: testPagePathSub,
        });

        assert.notStrictEqual(fetchedSubPage, undefined);
        assert.strictEqual(typeof fetchedSubPage, 'string');
        assert.ok(fetchedSubPage.includes(subPageParams.content));
      } catch (error) {
        console.error('Error in test:', error);
        throw error;
      }
    });

    void test('should update an existing wiki page if path already exists', async () => {
      // Get a valid wiki ID
      const wikiId = await getValidWikiId();

      try {
        // First create a page with initial content
        const initialParams: z.infer<typeof CreateWikiPageSchema> = {
          organizationId,
          projectId: projectName,
          wikiId,
          pagePath: testPagePath,
          content: 'Initial content.',
        };

        await createWikiPage(initialParams);

        // Now update the page with new content
        const updatedParams: z.infer<typeof CreateWikiPageSchema> = {
          ...initialParams,
          content: 'Updated content for the page.',
        };

        const updatedPage = await createWikiPage(updatedParams);

        // Verify the result
        assert.notStrictEqual(updatedPage, undefined);
        assert.strictEqual(updatedPage.path, testPagePath);
        assert.strictEqual(updatedPage.content, updatedParams.content);

        // Verify by fetching the page
        const fetchedPage = await getWikiPage({
          organizationId,
          projectId: projectName,
          wikiId,
          pagePath: testPagePath,
        });

        assert.notStrictEqual(fetchedPage, undefined);
        assert.strictEqual(typeof fetchedPage, 'string');
        assert.ok(fetchedPage.includes(updatedParams.content));
      } catch (error) {
        console.error('Error in test:', error);
        throw error;
      }
    });

    void test('should create a page with a default path if specified', async () => {
      // Get a valid wiki ID
      const wikiId = await getValidWikiId();

      try {
        const params: z.infer<typeof CreateWikiPageSchema> = {
          organizationId,
          projectId: projectName,
          wikiId,
          pagePath: testPagePathDefault,
          content: 'Content for page created with default path.',
        };

        const createdPage = await createWikiPage(params);

        // Verify the result
        assert.notStrictEqual(createdPage, undefined);
        assert.strictEqual(createdPage.path, testPagePathDefault);
        assert.strictEqual(createdPage.content, params.content);

        // Verify by fetching the page
        const fetchedPage = await getWikiPage({
          organizationId,
          projectId: projectName,
          wikiId,
          pagePath: testPagePathDefault,
        });

        assert.notStrictEqual(fetchedPage, undefined);
        assert.strictEqual(typeof fetchedPage, 'string');
        assert.ok(fetchedPage.includes(params.content));
      } catch (error) {
        console.error('Error in test:', error);
        throw error;
      }
    });

    void test('should include comment in the wiki page creation when provided', async () => {
      // Get a valid wiki ID
      const wikiId = await getValidWikiId();

      try {
        const params: z.infer<typeof CreateWikiPageSchema> = {
          organizationId,
          projectId: projectName,
          wikiId,
          pagePath: testPagePathComment,
          content: 'Content with comment.',
          comment: 'This is a test comment for the wiki page creation',
        };

        const createdPage = await createWikiPage(params);

        // Verify the result
        assert.notStrictEqual(createdPage, undefined);
        assert.strictEqual(createdPage.path, testPagePathComment);
        assert.strictEqual(createdPage.content, params.content);

        // Verify by fetching the page
        const fetchedPage = await getWikiPage({
          organizationId,
          projectId: projectName,
          wikiId,
          pagePath: testPagePathComment,
        });

        assert.notStrictEqual(fetchedPage, undefined);
        assert.strictEqual(typeof fetchedPage, 'string');
        assert.ok(fetchedPage.includes(params.content));

        // Note: The API might not return the comment in the response
        // This test primarily verifies that including a comment doesn't break the API call
      } catch (error) {
        console.error('Error in test:', error);
        throw error;
      }
    });

    void test('should handle error when wiki does not exist', async () => {
      const nonExistentWikiId = 'non-existent-wiki-12345';

      const params: z.infer<typeof CreateWikiPageSchema> = {
        organizationId,
        projectId: projectName,
        wikiId: nonExistentWikiId,
        pagePath: '/test-page',
        content: 'This should fail.',
      };

      await assert.rejects(() => createWikiPage(params), AzureDevOpsError);
    });

    void test('should handle error when project does not exist', async () => {
      const nonExistentProjectId = 'non-existent-project-12345';

      const params: z.infer<typeof CreateWikiPageSchema> = {
        organizationId,
        projectId: nonExistentProjectId,
        wikiId: 'any-wiki',
        pagePath: '/test-page',
        content: 'This should fail.',
      };

      await assert.rejects(() => createWikiPage(params), AzureDevOpsError);
    });

    void test('should handle error when organization does not exist', async () => {
      const nonExistentOrgId = 'non-existent-org-12345';

      const params: z.infer<typeof CreateWikiPageSchema> = {
        organizationId: nonExistentOrgId,
        projectId: projectName,
        wikiId: 'any-wiki',
        pagePath: '/test-page',
        content: 'This should fail.',
      };

      await assert.rejects(() => createWikiPage(params), AzureDevOpsError);
    });
  },
);

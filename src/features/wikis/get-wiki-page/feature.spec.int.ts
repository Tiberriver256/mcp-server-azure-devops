import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getWikiPage } from './feature.ts';
import { getWikis } from '../get-wikis/feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import { getOrgNameFromUrl } from '../../../shared/azure-devops-url.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getWikiPage integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let projectName: string;
    let orgUrl: string;

    before(async () => {
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT =
        process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'default-project';
      // Mock the required environment variable for testing
      process.env.AZURE_DEVOPS_ORG_URL =
        process.env.AZURE_DEVOPS_ORG_URL || 'https://example.visualstudio.com';
      // Get a real connection using environment variables
      const testConnection = await getTestConnection();
      if (!testConnection) {
        throw new Error(
          'Connection should be available when integration tests are enabled',
        );
      }
      connection = testConnection;

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
    });

    void test('should retrieve a wiki page', async () => {
      // First get available wikis
      const wikis = await getWikis(connection, { projectId: projectName });

      assert.ok(wikis.length > 0);

      // Use the first available wiki
      const wiki = wikis[0];
      if (!wiki.name) {
        throw new Error('Wiki name is undefined');
      }

      // Get the wiki page
      const result = await getWikiPage({
        organizationId: getOrgNameFromUrl(orgUrl),
        projectId: projectName,
        wikiId: wiki.name,
        pagePath: '/test',
      });

      // Verify the result
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(typeof result, 'string');
    });
  },
);

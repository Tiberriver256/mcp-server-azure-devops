import { WebApi } from 'azure-devops-node-api';
import { getWikiPage } from './feature';
import { getWikis } from '../get-wikis/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { getOrgNameFromUrl } from '@/utils/environment';

describe('getWikiPage integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;
  let orgUrl: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();

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
  });

  test('should retrieve a wiki page', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
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

    // Get the wiki page
    const result = await getWikiPage({
      organizationId: getOrgNameFromUrl(orgUrl),
      projectId: projectName,
      wikiId: wiki.name,
      pagePath: '/test',
    });

    // Verify the result
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});

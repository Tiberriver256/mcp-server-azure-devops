import { WebApi } from 'azure-devops-node-api';
import { getWikiPage } from './feature';
import { getWikis } from '../get-wikis/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { getOrgNameFromUrl } from '@/utils/environment';

process.env.AZURE_DEVOPS_DEFAULT_PROJECT =
  process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'default-project';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('getWikiPage integration', () => {
  let connection: WebApi;
  let projectName: string;
  let orgUrl: string;

  beforeAll(async () => {
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
      throw new Error('AZURE_DEVOPS_ORG_URL environment variable is required');
    }
    orgUrl = envOrgUrl;
  });

  test('should retrieve a wiki page', async () => {
    // First get available wikis
    const wikis = await getWikis(connection, { projectId: projectName });

    expect(wikis.length).toBeGreaterThan(0);

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

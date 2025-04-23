import { WebApi } from 'azure-devops-node-api';
import { updateWikiPage } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

describe('updateWikiPage integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;
  let organizationName: string;
  let wikiId: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    organizationName = process.env.AZURE_DEVOPS_ORGANIZATION || '';
    // Note: You'll need to set this to a valid wiki ID in your environment
    wikiId = `${projectName}.wiki`;
  });

  test('should update a wiki page in Azure DevOps', async () => {
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

    // Skip if no wiki ID is provided
    if (!wikiId) {
      console.log('Skipping test: No wiki ID provided');
      return;
    }

    const testPagePath = '/test-page';
    const testContent = '# Test Content\nThis is a test update.';
    const testComment = 'Test update from integration test';

    // Update the wiki page
    const result = await updateWikiPage({
      organizationId: organizationName,
      projectId: projectName,
      wikiId: wikiId,
      pagePath: testPagePath,
      content: testContent,
      comment: testComment,
    });

    // Verify the result
    expect(result).toBeDefined();
    expect(result.path).toBe(testPagePath);
    expect(result.content).toBe(testContent);
  });
});

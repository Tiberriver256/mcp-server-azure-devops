import { updateWikiPage } from './feature';
import { shouldSkipIntegrationTest } from '@/shared/test/test-helpers';
import { getOrgNameFromUrl } from '@/utils/environment';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('updateWikiPage integration', () => {
  let projectName: string;
  let wikiId: string;
  let organizationId: string;

  beforeAll(async () => {
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    // Note: You'll need to set this to a valid wiki ID in your environment
    wikiId = `${projectName}.wiki`;

    organizationId =
      process.env.AZURE_DEVOPS_ORG ||
      getOrgNameFromUrl(process.env.AZURE_DEVOPS_ORG_URL);
  });

  test('should update a wiki page in Azure DevOps', async () => {
    const testPagePath = '/test-page';
    const testContent = '# Test Content\nThis is a test update.';
    const testComment = 'Test update from integration test';

    // Update the wiki page
    const result = await updateWikiPage({
      organizationId,
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

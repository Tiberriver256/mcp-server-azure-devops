import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { updateWikiPage } from './feature.ts';
import { shouldSkipIntegrationTest } from '../../../shared/test/test-helpers.ts';
import { getOrgNameFromUrl } from '../../../shared/azure-devops-url.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'updateWikiPage integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let projectName: string;
    let wikiId: string;
    let organizationId: string | undefined;

    before(() => {
      projectName =
        process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
      // Note: You'll need to set this to a valid wiki ID in your environment
      wikiId = `${projectName}.wiki`;

      organizationId =
        process.env.AZURE_DEVOPS_ORG ||
        getOrgNameFromUrl(process.env.AZURE_DEVOPS_ORG_URL);
    });

    void test('should update a wiki page in Azure DevOps', async () => {
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
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.path, testPagePath);
      assert.strictEqual(result.content, testContent);
    });
  },
);

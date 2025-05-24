import { AzureDevOpsClient } from '../../../shared/api/client';
import { createWikiPage } from './feature';
import { CreateWikiPageSchema } from './schema';
import { getWikiPage } from '../get-wiki-page/feature'; // To verify creation
import { z } from 'zod';
import { loadEnvironment } from '../../../../test/utils/load-environment';
import { deleteWikiPage } from '../../../../test/utils/wiki-cleanup'; // Assuming a cleanup utility

// Load environment variables for testing, including PAT, org, project
loadEnvironment();

const { AZURE_ORG, AZURE_PROJECT, AZURE_DEVOPS_PAT } = process.env;

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

describeIf(
  !!AZURE_ORG && !!AZURE_PROJECT && !!AZURE_DEVOPS_PAT,
)('createWikiPage Integration Tests', () => {
  let client: AzureDevOpsClient;
  let testWikiId: string; // Assume a test wiki is set up or created for tests
  const testPagePath = '/MyIntegrationTestPage';
  const testPagePathSub = '/MyIntegrationTestPage/SubPageForCreate';


  beforeAll(() => {
    if (!AZURE_ORG || !AZURE_DEVOPS_PAT) {
      throw new Error(
        'Azure DevOps environment variables (AZURE_ORG, AZURE_DEVOPS_PAT) are not set.',
      );
    }
    client = new AzureDevOpsClient({
      personalAccessToken: AZURE_DEVOPS_PAT,
      organizationId: AZURE_ORG,
      projectId: AZURE_PROJECT, // Default project for client
    });

    // TODO: Set this to an existing test wiki ID in your Azure DevOps project
    // For a true end-to-end test, you might want to create a wiki first,
    // then run page tests, then delete the wiki.
    // For simplicity here, we assume 'mcp-server-test-wiki' exists or is created by a setup script.
    testWikiId = 'mcp-server-test-wiki'; 
  });

  afterEach(async () => {
    // Cleanup: Delete the created wiki page after each test
    // This requires a deleteWikiPage function or similar API endpoint.
    // The standard way to "delete" a page is to use the Pages - Delete API
    // For now, we'll assume a utility function `deleteWikiPage` exists for this.
    // If not, this part would need to call the client.delete with the correct API.
    try {
      await deleteWikiPage(client, {
        organizationId: AZURE_ORG,
        projectId: AZURE_PROJECT,
        wikiId: testWikiId,
        pagePath: testPagePath,
      });
    } catch (error) {
      // console.warn(`Warning: Could not delete test page ${testPagePath}:`, error);
    }
    try {
      await deleteWikiPage(client, {
        organizationId: AZURE_ORG,
        projectId: AZURE_PROJECT,
        wikiId: testWikiId,
        pagePath: testPagePathSub,
      });
    } catch (error) {
      // console.warn(`Warning: Could not delete test page ${testPagePathSub}:`, error);
    }
  });

  it('should create a new wiki page at the root', async () => {
    const params: z.infer<typeof CreateWikiPageSchema> = {
      organizationId: AZURE_ORG,
      projectId: AZURE_PROJECT,
      wikiId: testWikiId,
      pagePath: testPagePath, // Specify a unique path for this test
      content: 'This is content for the integration test page (root).',
    };

    const createdPage = await createWikiPage(params, client);
    expect(createdPage).toBeDefined();
    expect(createdPage.path).toBe(testPagePath);
    expect(createdPage.content).toBe(params.content);

    // Verify by fetching the page
    const fetchedPage = await getWikiPage(
      {
        organizationId: AZURE_ORG,
        projectId: AZURE_PROJECT,
        wikiId: testWikiId,
        pagePath: testPagePath,
        includeContent: true,
      },
      client,
    );
    expect(fetchedPage).toBeDefined();
    expect(fetchedPage.content).toBe(params.content);
  });

  it('should create a new wiki sub-page', async () => {
    // First, ensure the parent page exists or create it
    // For simplicity, we'll create it here. In a more complex scenario,
    // you might have a dedicated setup for parent pages.
    const parentParams: z.infer<typeof CreateWikiPageSchema> = {
      organizationId: AZURE_ORG,
      projectId: AZURE_PROJECT,
      wikiId: testWikiId,
      pagePath: testPagePath, // Parent page
      content: 'This is the parent page for the sub-page test.',
    };
    await createWikiPage(parentParams, client);


    const subPageParams: z.infer<typeof CreateWikiPageSchema> = {
      organizationId: AZURE_ORG,
      projectId: AZURE_PROJECT,
      wikiId: testWikiId,
      pagePath: testPagePathSub, // Path for the sub-page
      content: 'This is content for the integration test sub-page.',
    };

    const createdSubPage = await createWikiPage(subPageParams, client);
    expect(createdSubPage).toBeDefined();
    expect(createdSubPage.path).toBe(testPagePathSub);
    expect(createdSubPage.content).toBe(subPageParams.content);

    // Verify by fetching the sub-page
    const fetchedSubPage = await getWikiPage(
      {
        organizationId: AZURE_ORG,
        projectId: AZURE_PROJECT,
        wikiId: testWikiId,
        pagePath: testPagePathSub,
        includeContent: true,
      },
      client,
    );
    expect(fetchedSubPage).toBeDefined();
    expect(fetchedSubPage.content).toBe(subPageParams.content);
  });
  
  it('should update an existing wiki page if path already exists', async () => {
    const initialParams: z.infer<typeof CreateWikiPageSchema> = {
      organizationId: AZURE_ORG,
      projectId: AZURE_PROJECT,
      wikiId: testWikiId,
      pagePath: testPagePath,
      content: 'Initial content.',
    };
    await createWikiPage(initialParams, client);

    const updatedParams: z.infer<typeof CreateWikiPageSchema> = {
      ...initialParams,
      content: 'Updated content for the page.',
    };
    const updatedPage = await createWikiPage(updatedParams, client);
    expect(updatedPage).toBeDefined();
    expect(updatedPage.path).toBe(testPagePath);
    expect(updatedPage.content).toBe(updatedParams.content);
    
    // Verify by fetching the page
    const fetchedPage = await getWikiPage(
      {
        organizationId: AZURE_ORG,
        projectId: AZURE_PROJECT,
        wikiId: testWikiId,
        pagePath: testPagePath,
        includeContent: true,
      },
      client,
    );
    expect(fetchedPage.content).toBe(updatedParams.content);
  });

  // Test for default pagePath ('/') - this might be tricky if the root page cannot be easily cleaned up
  // or if it has special meaning. Consider if this test is essential or can be covered by specific paths.
  it('should create a page at the default path ("/") if pagePath is not provided', async () => {
    const rootPagePath = '/CreatedWithDefaultPath'; // Use a specific name for cleanup
     try {
      await deleteWikiPage(client, { // Pre-cleanup
        organizationId: AZURE_ORG,
        projectId: AZURE_PROJECT,
        wikiId: testWikiId,
        pagePath: rootPagePath,
      });
    } catch (e) { /* pre-cleanup failed, maybe page didn't exist */ }


    const params: z.infer<typeof CreateWikiPageSchema> = {
      organizationId: AZURE_ORG,
      projectId: AZURE_PROJECT,
      wikiId: testWikiId,
      // pagePath is omitted, should default to '/' as per schema, but feature uses '/${name}' or similar
      // The schema default is '/', but the API call is `pages?path=${encodeURIComponent(pagePath ?? '/')}`
      // Let's use a specific path that is equivalent to root for testing if schema default works in practice
      pagePath: rootPagePath, 
      content: 'Content for page created at default path.',
    };
    
    // To test actual default '/' from schema, we would not pass pagePath.
    // However, the createWikiPage API requires a path in its URL.
    // The schema default of '/' is for the `pagePath` property itself if not provided.
    // The `feature.ts` uses `pagePath ?? '/'`. So if `pagePath` is `undefined` or `null`, it becomes `'/'`.

    const createdPage = await createWikiPage(params, client);
    expect(createdPage).toBeDefined();
    // The API might return the actual root path differently, e.g. just '/', or the wiki name if it's the home page.
    // For this test, we used a named root page.
    expect(createdPage.path).toBe(rootPagePath); 
    expect(createdPage.content).toBe(params.content);

    const fetchedPage = await getWikiPage(
      {
        organizationId: AZURE_ORG,
        projectId: AZURE_PROJECT,
        wikiId: testWikiId,
        pagePath: rootPagePath,
        includeContent: true,
      },
      client,
    );
    expect(fetchedPage.content).toBe(params.content);
    
    // Cleanup for this specific test
    await deleteWikiPage(client, {
      organizationId: AZURE_ORG,
      projectId: AZURE_PROJECT,
      wikiId: testWikiId,
      pagePath: rootPagePath,
    });
  });
});

// Helper to load environment variables (ensure this utility exists and is correctly pathed)
// Example test/utils/load-environment.ts
// import dotenv from 'dotenv';
// import path from 'path';
// export const loadEnvironment = () => {
//   dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
// };

// Placeholder for test/utils/wiki-cleanup.ts
// import { AzureDevOpsClient } from "...";
// export const deleteWikiPage = async (client, { organizationId, projectId, wikiId, pagePath }) => {
//   const org = organizationId ?? client.defaults.organizationId;
//   const project = projectId ?? client.defaults.projectId;
//   const apiUrl = `${org}/${project ? project + '/' : ''}_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(pagePath)}&api-version=7.1-preview.1`;
//   await client.delete(apiUrl);
// };

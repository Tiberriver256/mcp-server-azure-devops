import { WebApi } from 'azure-devops-node-api';
import { createWiki } from './feature';
import { WikiType } from './schema';
import { getTestConnection } from '@/shared/test/test-helpers';
import axios from 'axios';

axios.interceptors.request.use((request) => {
  console.log('Starting Request', JSON.stringify(request, null, 2));
  return request;
});

describe('createWiki (Integration)', () => {
  let connection: WebApi | null = null;
  let projectName: string;
  const testWikiName = `TestWiki_${new Date().getTime()}`;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
  });

  test.skip('should create a project wiki', async () => {
    // PERMANENTLY SKIPPED: Azure DevOps only allows one wiki per project.
    // Running this test multiple times would fail after the first wiki is created.
    // This test is kept for reference but cannot be run repeatedly.

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // Create the wiki
    const wiki = await createWiki(connection, {
      name: testWikiName,
      projectId: projectName,
      type: WikiType.ProjectWiki,
    });

    // Verify the wiki was created
    expect(wiki).toBeDefined();
    expect(wiki.name).toBe(testWikiName);
    expect(wiki.projectId).toBe(projectName);
    expect(wiki.type).toBe(WikiType.ProjectWiki);
  });

  // NOTE: We're not testing code wiki creation since that requires a repository
  // that would need to be created/cleaned up and is outside the scope of this test
});

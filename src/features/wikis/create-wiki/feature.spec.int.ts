import { WebApi } from 'azure-devops-node-api';
import { createWiki } from './feature';
import { WikiType } from './schema';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { getWikis } from '../get-wikis/feature';
import { AzureDevOpsError } from '@/shared/errors';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('createWiki (Integration)', () => {
  let connection: WebApi;
  let projectName: string;

  beforeAll(async () => {
    const testConnection = await getTestConnection();
    if (!testConnection) {
      throw new Error(
        'Connection should be available when integration tests are enabled',
      );
    }
    connection = testConnection;

    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '';
    if (!projectName) {
      throw new Error('AZURE_DEVOPS_DEFAULT_PROJECT must be set for this test');
    }
  });

  test('should create a project wiki or report that it already exists', async () => {
    const existing = await getWikis(connection, { projectId: projectName });
    const expectedProjectWikiName = `${projectName}.wiki`;
    const hasProjectWiki = existing.some(
      (w) => w.name === expectedProjectWikiName,
    );

    const options = {
      name: `${projectName}.wiki`,
      projectId: projectName,
      type: WikiType.ProjectWiki,
    };

    if (hasProjectWiki) {
      await expect(createWiki(connection, options)).rejects.toThrow(
        AzureDevOpsError,
      );
    } else {
      const wiki = await createWiki(connection, options);

      expect(wiki).toBeDefined();
      expect(wiki.projectId).toBeDefined();
      expect(String(wiki.type)).toBe('projectWiki');
    }
  }, 60000);
});

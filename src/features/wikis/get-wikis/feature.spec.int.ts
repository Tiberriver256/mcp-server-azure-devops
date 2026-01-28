import { WebApi } from 'azure-devops-node-api';
import { getWikis } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('getWikis integration', () => {
  let connection: WebApi;
  let projectName: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    const testConnection = await getTestConnection();
    if (!testConnection) {
      throw new Error(
        'Connection should be available when integration tests are enabled',
      );
    }
    connection = testConnection;
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
  });

  test('should retrieve wikis from Azure DevOps', async () => {
    // Get the wikis
    const result = await getWikis(connection, {
      projectId: projectName,
    });

    // Verify the result
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0].name).toBeDefined();
      expect(result[0].id).toBeDefined();
      expect(result[0].type).toBeDefined();
    }
  });
});

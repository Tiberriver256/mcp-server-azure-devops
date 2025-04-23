import { WebApi } from 'azure-devops-node-api';
import { getWikis } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

describe('getWikis integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
  });

  test('should retrieve wikis from Azure DevOps', async () => {
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

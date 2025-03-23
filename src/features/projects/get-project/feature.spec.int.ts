import { WebApi } from 'azure-devops-node-api';
import { getProject } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

describe('getProject integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
  });

  test('should retrieve a real project from Azure DevOps', async () => {
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

    // Act - make an actual API call to Azure DevOps
    const result = await getProject(connection, projectName);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.name).toBe(projectName);
    expect(result.id).toBeDefined();
    expect(result.url).toBeDefined();
    expect(result.state).toBeDefined();

    // Verify basic project structure
    expect(result.visibility).toBeDefined();
    expect(result.lastUpdateTime).toBeDefined();
  });

  test('should throw error when project is not found', async () => {
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

    // Use a non-existent project name
    const nonExistentProjectName = 'non-existent-project-' + Date.now();

    // Act & Assert - should throw an error for non-existent project
    await expect(
      getProject(connection, nonExistentProjectName),
    ).rejects.toThrow(/not found|Failed to get project/);
  });
});

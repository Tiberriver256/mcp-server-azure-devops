import { WebApi } from 'azure-devops-node-api';
import { listRepositories } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { ListRepositoriesOptions } from '../types';

describe('listRepositories integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
  });

  test('should list repositories in a project', async () => {
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

    const options: ListRepositoriesOptions = {
      projectId: projectName,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await listRepositories(connection, options);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);

    // Check structure of returned items (even if empty)
    if (result.length > 0) {
      const firstRepo = result[0];
      expect(firstRepo.id).toBeDefined();
      expect(firstRepo.name).toBeDefined();
      expect(firstRepo.project).toBeDefined();

      if (firstRepo.project) {
        expect(firstRepo.project.name).toBe(projectName);
      }
    }
  });

  test('should include links when option is specified', async () => {
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

    const options: ListRepositoriesOptions = {
      projectId: projectName,
      includeLinks: true,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await listRepositories(connection, options);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);

    // Verify links are included, if repositories exist
    if (result.length > 0) {
      const firstRepo = result[0];
      expect(firstRepo._links).toBeDefined();
    }
  });
});

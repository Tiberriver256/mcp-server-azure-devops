import { WebApi } from 'azure-devops-node-api';
import { listProjects } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { ListProjectsOptions } from '../types';

describe('listProjects integration', () => {
  let connection: WebApi | null = null;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
  });

  test('should list projects in the organization', async () => {
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
    const result = await listProjects(connection);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);

    // Check structure of returned items (even if empty)
    if (result.length > 0) {
      const firstProject = result[0];
      expect(firstProject.id).toBeDefined();
      expect(firstProject.name).toBeDefined();
      expect(firstProject.url).toBeDefined();
      expect(firstProject.state).toBeDefined();
    }
  });

  test('should apply pagination options', async () => {
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

    const options: ListProjectsOptions = {
      top: 2, // Only get up to 2 projects
    };

    // Act - make an actual API call to Azure DevOps
    const result = await listProjects(connection, options);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(2);

    // If we have projects, check for correct limit
    if (result.length > 0) {
      // Get all projects to compare
      const allProjects = await listProjects(connection);

      // If we have more than 2 total projects, pagination should have limited results
      if (allProjects.length > 2) {
        expect(result.length).toBe(2);
        expect(result.length).toBeLessThan(allProjects.length);
      }
    }
  });
});

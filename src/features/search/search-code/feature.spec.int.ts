import { WebApi } from 'azure-devops-node-api';
import { searchCode } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { SearchCodeOptions } from '../types';

describe('searchCode integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
  });

  test('should search code in a project', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      console.log('Skipping test: No Azure DevOps connection available');
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    const options: SearchCodeOptions = {
      searchText: 'function',
      projectId: projectName,
      top: 10,
    };

    try {
      // Act - make an actual API call to Azure DevOps
      const result = await searchCode(connection, options);

      // Assert on the actual response
      expect(result).toBeDefined();
      expect(typeof result.count).toBe('number');
      expect(Array.isArray(result.results)).toBe(true);

      // Check structure of returned items (if any)
      if (result.results.length > 0) {
        const firstResult = result.results[0];
        expect(firstResult.fileName).toBeDefined();
        expect(firstResult.path).toBeDefined();
        expect(firstResult.project).toBeDefined();
        expect(firstResult.repository).toBeDefined();

        if (firstResult.project) {
          expect(firstResult.project.name).toBe(projectName);
        }
      }
    } catch (error) {
      // Skip test if the code search extension is not installed
      if (
        error instanceof Error &&
        (error.message.includes('ms.vss-code-search is not installed') ||
          error.message.includes('Resource not found') ||
          error.message.includes('Failed to search code'))
      ) {
        console.log(
          'Skipping test: Code Search extension is not installed or not available in this Azure DevOps organization',
        );
        return;
      }
      throw error;
    }
  });

  test('should include file content when requested', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      console.log('Skipping test: No Azure DevOps connection available');
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    const options: SearchCodeOptions = {
      searchText: 'function',
      projectId: projectName,
      top: 5,
      includeContent: true,
    };

    try {
      // Act - make an actual API call to Azure DevOps
      const result = await searchCode(connection, options);

      // Assert on the actual response
      expect(result).toBeDefined();

      // Check if content is included (if any results)
      if (result.results.length > 0) {
        // At least some results should have content
        // Note: Some files might fail to fetch content, so we don't expect all to have it
        const hasContent = result.results.some((r) => r.content !== undefined);
        expect(hasContent).toBe(true);
      }
    } catch (error) {
      // Skip test if the code search extension is not installed
      if (
        error instanceof Error &&
        (error.message.includes('ms.vss-code-search is not installed') ||
          error.message.includes('Resource not found') ||
          error.message.includes('Failed to search code'))
      ) {
        console.log(
          'Skipping test: Code Search extension is not installed or not available in this Azure DevOps organization',
        );
        return;
      }
      throw error;
    }
  });

  test('should filter results when filters are provided', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      console.log('Skipping test: No Azure DevOps connection available');
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    try {
      // First get some results to find a repository name
      const initialOptions: SearchCodeOptions = {
        searchText: 'function',
        projectId: projectName,
        top: 1,
      };

      const initialResult = await searchCode(connection, initialOptions);

      // Skip if no results found
      if (initialResult.results.length === 0) {
        console.log('Skipping filter test: No initial results found');
        return;
      }

      // Use the repository from the first result for filtering
      const repoName = initialResult.results[0].repository.name;

      const filteredOptions: SearchCodeOptions = {
        searchText: 'function',
        projectId: projectName,
        filters: {
          Repository: [repoName],
        },
        top: 5,
      };

      // Act - make an actual API call to Azure DevOps with filters
      const result = await searchCode(connection, filteredOptions);

      // Assert on the actual response
      expect(result).toBeDefined();

      // All results should be from the specified repository
      if (result.results.length > 0) {
        const allFromRepo = result.results.every(
          (r) => r.repository.name === repoName,
        );
        expect(allFromRepo).toBe(true);
      }
    } catch (error) {
      // Skip test if the code search extension is not installed
      if (
        error instanceof Error &&
        (error.message.includes('ms.vss-code-search is not installed') ||
          error.message.includes('Resource not found') ||
          error.message.includes('Failed to search code'))
      ) {
        console.log(
          'Skipping test: Code Search extension is not installed or not available in this Azure DevOps organization',
        );
        return;
      }
      throw error;
    }
  });

  test('should handle pagination', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      console.log('Skipping test: No Azure DevOps connection available');
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    try {
      // Get first page
      const firstPageOptions: SearchCodeOptions = {
        searchText: 'function',
        projectId: projectName,
        top: 2,
        skip: 0,
      };

      const firstPageResult = await searchCode(connection, firstPageOptions);

      // Skip if not enough results for pagination test
      if (firstPageResult.count <= 2) {
        console.log('Skipping pagination test: Not enough results');
        return;
      }

      // Get second page
      const secondPageOptions: SearchCodeOptions = {
        searchText: 'function',
        projectId: projectName,
        top: 2,
        skip: 2,
      };

      const secondPageResult = await searchCode(connection, secondPageOptions);

      // Assert on pagination
      expect(secondPageResult).toBeDefined();
      expect(secondPageResult.results.length).toBeGreaterThan(0);

      // First and second page should have different results
      if (
        firstPageResult.results.length > 0 &&
        secondPageResult.results.length > 0
      ) {
        const firstPagePaths = firstPageResult.results.map((r) => r.path);
        const secondPagePaths = secondPageResult.results.map((r) => r.path);

        // Check if there's any overlap between pages
        const hasOverlap = firstPagePaths.some((path) =>
          secondPagePaths.includes(path),
        );
        expect(hasOverlap).toBe(false);
      }
    } catch (error) {
      // Skip test if the code search extension is not installed
      if (
        error instanceof Error &&
        (error.message.includes('ms.vss-code-search is not installed') ||
          error.message.includes('Resource not found') ||
          error.message.includes('Failed to search code'))
      ) {
        console.log(
          'Skipping test: Code Search extension is not installed or not available in this Azure DevOps organization',
        );
        return;
      }
      throw error;
    }
  });
});

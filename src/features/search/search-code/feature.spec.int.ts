import { WebApi } from 'azure-devops-node-api';
import { searchCode } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { SearchCodeOptions } from '../types';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;
const codeSearchErrorPatterns = [
  'ms.vss-code-search is not installed',
  'Resource not found',
  'Failed to search code',
];

const rethrowCodeSearchError = (error: unknown): never => {
  if (
    error instanceof Error &&
    codeSearchErrorPatterns.some((pattern) => error.message.includes(pattern))
  ) {
    throw new Error('Code Search extension is required for integration tests');
  }
  throw error;
};

describeOrSkip('searchCode integration', () => {
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

  test('should search code in a project', async () => {
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
      rethrowCodeSearchError(error);
    }
  });

  test('should include file content when requested', async () => {
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
      rethrowCodeSearchError(error);
    }
  });

  test('should filter results when filters are provided', async () => {
    try {
      // First get some results to find a repository name
      const initialOptions: SearchCodeOptions = {
        searchText: 'function',
        projectId: projectName,
        top: 1,
      };

      const initialResult = await searchCode(connection, initialOptions);

      expect(initialResult.results.length).toBeGreaterThan(0);

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
      rethrowCodeSearchError(error);
    }
  });

  test('should handle pagination', async () => {
    try {
      // Get first page
      const firstPageOptions: SearchCodeOptions = {
        searchText: 'function',
        projectId: projectName,
        top: 2,
        skip: 0,
      };

      const firstPageResult = await searchCode(connection, firstPageOptions);

      expect(firstPageResult.count).toBeGreaterThan(2);

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
      rethrowCodeSearchError(error);
    }
  });

  test('should use default project when no projectId is provided', async () => {
    // Store original environment variable
    const originalEnv = process.env.AZURE_DEVOPS_DEFAULT_PROJECT;

    try {
      // Set the default project to the current project name for testing
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT = projectName;

      // Search without specifying a project ID
      const options: SearchCodeOptions = {
        searchText: 'function',
        top: 5,
      };

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
      rethrowCodeSearchError(error);
    } finally {
      // Restore original environment variable
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT = originalEnv;
    }
  });
});

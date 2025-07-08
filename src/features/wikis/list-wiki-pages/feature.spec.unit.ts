import { listWikiPages, WikiPageSummary } from './feature';
import * as azureDevOpsClient from '../../../clients/azure-devops';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsPermissionError,
} from '../../../shared/errors/azure-devops-errors';

// Mock the Azure DevOps client
jest.mock('../../../clients/azure-devops');

// Mock the environment utilities to avoid dependency on environment variables
jest.mock('../../../utils/environment', () => ({
  defaultOrg: 'azure-devops-mcp-testing',
  defaultProject: 'eShopOnWeb',
}));

describe('listWikiPages unit', () => {
  // Mock WikiClient
  const mockWikiClient = {
    listWikiPages: jest.fn(),
  };

  // Mock getWikiClient function
  const mockGetWikiClient =
    azureDevOpsClient.getWikiClient as jest.MockedFunction<
      typeof azureDevOpsClient.getWikiClient
    >;

  beforeEach(() => {
    // Clear mock calls between tests
    jest.clearAllMocks();

    // Setup default mock implementation
    mockGetWikiClient.mockResolvedValue(mockWikiClient as any);
  });

  describe('Happy Path Scenarios', () => {
    test('should return wiki pages successfully', async () => {
      // Mock data
      const mockPages: WikiPageSummary[] = [
        {
          id: 1,
          path: '/Home',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/1',
          order: 1,
        },
        {
          id: 2,
          path: '/Getting-Started',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/2',
          order: 2,
        },
      ];

      // Setup mock responses
      mockWikiClient.listWikiPages.mockResolvedValue(mockPages);

      // Call the function
      const result = await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'test-wiki',
      });

      // Assertions
      expect(mockGetWikiClient).toHaveBeenCalledWith({
        organizationId: 'test-org',
      });
      expect(mockWikiClient.listWikiPages).toHaveBeenCalledWith(
        'test-project',
        'test-wiki',
      );
      expect(result).toEqual(mockPages);
      expect(result.length).toBe(2);
    });

    test('should handle basic listing without parameters', async () => {
      const mockPages: WikiPageSummary[] = [
        {
          id: 3,
          path: '/docs/api',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/3',
          order: 1,
        },
      ];

      mockWikiClient.listWikiPages.mockResolvedValue(mockPages);

      const result = await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'test-wiki',
      });

      expect(mockWikiClient.listWikiPages).toHaveBeenCalledWith(
        'test-project',
        'test-wiki',
      );
      expect(result).toEqual(mockPages);
    });

    test('should handle nested pages correctly', async () => {
      const mockPages: WikiPageSummary[] = [
        {
          id: 4,
          path: '/deep/nested/page',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/4',
          order: 1,
        },
      ];

      mockWikiClient.listWikiPages.mockResolvedValue(mockPages);

      const result = await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'test-wiki',
      });

      expect(mockWikiClient.listWikiPages).toHaveBeenCalledWith(
        'test-project',
        'test-wiki',
      );
      expect(result).toEqual(mockPages);
    });

    test('should handle empty wiki correctly', async () => {
      const mockPages: WikiPageSummary[] = [];

      mockWikiClient.listWikiPages.mockResolvedValue(mockPages);

      const result = await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'test-wiki',
      });

      expect(mockWikiClient.listWikiPages).toHaveBeenCalledWith(
        'test-project',
        'test-wiki',
      );
      expect(result).toEqual(mockPages);
    });

    test('should return empty array when no pages found', async () => {
      mockWikiClient.listWikiPages.mockResolvedValue([]);

      const result = await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'empty-wiki',
      });

      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    test('should use default organization and project when not provided', async () => {
      const mockPages: WikiPageSummary[] = [
        {
          id: 5,
          path: '/default-page',
          url: 'https://dev.azure.com/default-org/default-project/_wiki/wikis/wiki1/5',
          order: 1,
        },
      ];

      mockWikiClient.listWikiPages.mockResolvedValue(mockPages);

      const result = await listWikiPages({
        wikiId: 'test-wiki',
      });

      expect(mockGetWikiClient).toHaveBeenCalledWith({
        organizationId: 'azure-devops-mcp-testing', // Uses default from environment
      });
      expect(result).toEqual(mockPages);
    });
  });

  describe('Error Scenarios', () => {
    test('should handle network timeout errors', async () => {
      const timeoutError = new Error('Network timeout');
      timeoutError.name = 'ETIMEDOUT';
      mockWikiClient.listWikiPages.mockRejectedValue(timeoutError);

      await expect(
        listWikiPages({
          organizationId: 'test-org',
          projectId: 'test-project',
          wikiId: 'test-wiki',
        }),
      ).rejects.toThrow(AzureDevOpsError);
    });

    test('should handle connection refused errors', async () => {
      const connectionError = new Error('Connection refused');
      connectionError.name = 'ECONNREFUSED';
      mockWikiClient.listWikiPages.mockRejectedValue(connectionError);

      await expect(
        listWikiPages({
          organizationId: 'test-org',
          projectId: 'test-project',
          wikiId: 'test-wiki',
        }),
      ).rejects.toThrow(AzureDevOpsError);
    });

    test('should propagate AzureDevOpsResourceNotFoundError from client', async () => {
      const notFoundError = new AzureDevOpsResourceNotFoundError(
        'Wiki not found: test-wiki',
      );
      mockWikiClient.listWikiPages.mockRejectedValue(notFoundError);

      await expect(
        listWikiPages({
          organizationId: 'test-org',
          projectId: 'test-project',
          wikiId: 'non-existent-wiki',
        }),
      ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
    });

    test('should propagate AzureDevOpsPermissionError from client', async () => {
      const permissionError = new AzureDevOpsPermissionError(
        'Permission denied to access wiki',
      );
      mockWikiClient.listWikiPages.mockRejectedValue(permissionError);

      await expect(
        listWikiPages({
          organizationId: 'test-org',
          projectId: 'test-project',
          wikiId: 'restricted-wiki',
        }),
      ).rejects.toThrow(AzureDevOpsPermissionError);
    });

    test('should wrap unknown errors in AzureDevOpsError', async () => {
      const unknownError = new Error('Unknown error occurred');
      mockWikiClient.listWikiPages.mockRejectedValue(unknownError);

      await expect(
        listWikiPages({
          organizationId: 'test-org',
          projectId: 'test-project',
          wikiId: 'test-wiki',
        }),
      ).rejects.toThrow(AzureDevOpsError);

      try {
        await listWikiPages({
          organizationId: 'test-org',
          projectId: 'test-project',
          wikiId: 'test-wiki',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AzureDevOpsError);
        expect((error as AzureDevOpsError).message).toBe(
          'Failed to list wiki pages',
        );
      }
    });

    test('should handle client creation failure', async () => {
      const clientError = new Error('Failed to create client');
      mockGetWikiClient.mockRejectedValue(clientError);

      await expect(
        listWikiPages({
          organizationId: 'invalid-org',
          projectId: 'test-project',
          wikiId: 'test-wiki',
        }),
      ).rejects.toThrow(AzureDevOpsError);
    });
  });

  describe('Edge Cases and Input Validation', () => {
    test('should handle malformed API response gracefully', async () => {
      // Mock malformed response (missing required fields)
      const malformedPages = [
        {
          id: 'invalid-id', // Should be number
          path: null, // Should be string
          url: undefined, // Should be string
        },
      ];

      mockWikiClient.listWikiPages.mockResolvedValue(malformedPages as any);

      const result = await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'test-wiki',
      });

      // Should still return the data as-is (transformation happens in client)
      expect(result).toEqual(malformedPages);
    });

    test('should handle null/undefined response from client', async () => {
      mockWikiClient.listWikiPages.mockResolvedValue(null as any);

      await expect(
        listWikiPages({
          organizationId: 'test-org',
          projectId: 'test-project',
          wikiId: 'test-wiki',
        }),
      ).rejects.toThrow(AzureDevOpsError);
    });

    test('should handle very large page collections', async () => {
      // Create a large mock dataset
      const largeMockPages: WikiPageSummary[] = Array.from(
        { length: 10000 },
        (_, i) => ({
          id: i + 1,
          path: `/page-${i + 1}`,
          url: `https://dev.azure.com/org/project/_wiki/wikis/wiki1/${i + 1}`,
          order: i + 1,
        }),
      );

      mockWikiClient.listWikiPages.mockResolvedValue(largeMockPages);

      const result = await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'large-wiki',
      });

      expect(result).toEqual(largeMockPages);
      expect(result.length).toBe(10000);
    });

    test('should handle pages with special characters in paths', async () => {
      const specialCharPages: WikiPageSummary[] = [
        {
          id: 1,
          path: '/页面-中文',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/1',
          order: 1,
        },
        {
          id: 2,
          path: '/página-español',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/2',
          order: 2,
        },
        {
          id: 3,
          path: '/page with spaces & symbols!@#$%',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/3',
          order: 3,
        },
      ];

      mockWikiClient.listWikiPages.mockResolvedValue(specialCharPages);

      const result = await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'special-wiki',
      });

      expect(result).toEqual(specialCharPages);
    });

    test('should handle pages with missing optional order field', async () => {
      const pagesWithoutOrder: WikiPageSummary[] = [
        {
          id: 1,
          path: '/page-1',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/1',
          // order field is optional and missing
        } as WikiPageSummary,
        {
          id: 2,
          path: '/page-2',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/2',
          order: 5,
        },
      ];

      mockWikiClient.listWikiPages.mockResolvedValue(pagesWithoutOrder);

      const result = await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'test-wiki',
      });

      expect(result).toEqual(pagesWithoutOrder);
      expect(result[0].order).toBeUndefined();
      expect(result[1].order).toBe(5);
    });
  });

  describe('Parameter Validation Edge Cases', () => {
    test('should handle basic parameter validation', async () => {
      const mockPages: WikiPageSummary[] = [];
      mockWikiClient.listWikiPages.mockResolvedValue(mockPages);

      await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'test-wiki',
      });

      expect(mockWikiClient.listWikiPages).toHaveBeenCalledWith(
        'test-project',
        'test-wiki',
      );

      await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'test-wiki',
      });

      expect(mockWikiClient.listWikiPages).toHaveBeenCalledWith(
        'test-project',
        'test-wiki',
      );
    });

    test('should handle empty string parameters', async () => {
      const mockPages: WikiPageSummary[] = [];
      mockWikiClient.listWikiPages.mockResolvedValue(mockPages);

      await listWikiPages({
        organizationId: '',
        projectId: '',
        wikiId: 'test-wiki',
      });

      expect(mockGetWikiClient).toHaveBeenCalledWith({
        organizationId: 'azure-devops-mcp-testing', // Empty string gets overridden by default
      });
      expect(mockWikiClient.listWikiPages).toHaveBeenCalledWith(
        'eShopOnWeb', // Empty string gets overridden by default project
        'test-wiki',
      );
    });
  });

  describe('Data Transformation and Mapping', () => {
    test('should preserve all WikiPageSummary fields correctly', async () => {
      const mockPages: WikiPageSummary[] = [
        {
          id: 42,
          path: '/test-page',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/42',
          order: 10,
        },
      ];

      mockWikiClient.listWikiPages.mockResolvedValue(mockPages);

      const result = await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'test-wiki',
      });

      expect(result[0]).toEqual({
        id: 42,
        path: '/test-page',
        url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/42',
        order: 10,
      });
    });

    test('should handle mixed data types in response', async () => {
      const mixedPages = [
        {
          id: 1,
          path: '/normal-page',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/1',
          order: 1,
        },
        {
          id: 2,
          path: '/page-without-order',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/2',
          // order is undefined
        },
        {
          id: 3,
          path: '/page-with-zero-order',
          url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1/3',
          order: 0,
        },
      ];

      mockWikiClient.listWikiPages.mockResolvedValue(
        mixedPages as WikiPageSummary[],
      );

      const result = await listWikiPages({
        organizationId: 'test-org',
        projectId: 'test-project',
        wikiId: 'test-wiki',
      });

      expect(result).toEqual(mixedPages);
      expect(result[1].order).toBeUndefined();
      expect(result[2].order).toBe(0);
    });
  });
});

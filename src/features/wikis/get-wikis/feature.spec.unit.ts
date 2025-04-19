import { WebApi } from 'azure-devops-node-api';
import { WikiV2 } from 'azure-devops-node-api/interfaces/WikiInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { getWikis } from './feature';

// Mock the Azure DevOps WebApi
jest.mock('azure-devops-node-api');

describe('getWikis unit', () => {
  // Mock WikiApi client
  const mockWikiApi = {
    getAllWikis: jest.fn(),
  };

  // Mock WebApi connection
  const mockConnection = {
    getWikiApi: jest.fn().mockResolvedValue(mockWikiApi),
  } as unknown as WebApi;

  beforeEach(() => {
    // Clear mock calls between tests
    jest.clearAllMocks();
  });

  test('should return wikis for a project', async () => {
    // Mock data
    const mockWikis: WikiV2[] = [
      {
        id: 'wiki1',
        name: 'Project Wiki',
        mappedPath: '/',
        remoteUrl: 'https://example.com/wiki1',
        url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1',
      },
      {
        id: 'wiki2',
        name: 'Code Wiki',
        mappedPath: '/docs',
        remoteUrl: 'https://example.com/wiki2',
        url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki2',
      },
    ];

    // Setup mock responses
    mockWikiApi.getAllWikis.mockResolvedValue(mockWikis);

    // Call the function
    const result = await getWikis(mockConnection, {
      projectId: 'testProject',
    });

    // Assertions
    expect(mockConnection.getWikiApi).toHaveBeenCalledTimes(1);
    expect(mockWikiApi.getAllWikis).toHaveBeenCalledWith('testProject');
    expect(result).toEqual(mockWikis);
    expect(result.length).toBe(2);
  });

  test('should return empty array when no wikis are found', async () => {
    // Setup mock responses
    mockWikiApi.getAllWikis.mockResolvedValue([]);

    // Call the function
    const result = await getWikis(mockConnection, {
      projectId: 'projectWithNoWikis',
    });

    // Assertions
    expect(mockConnection.getWikiApi).toHaveBeenCalledTimes(1);
    expect(mockWikiApi.getAllWikis).toHaveBeenCalledWith('projectWithNoWikis');
    expect(result).toEqual([]);
  });

  test('should handle API errors gracefully', async () => {
    // Setup mock to throw an error
    const mockError = new Error('API error occurred');
    mockWikiApi.getAllWikis.mockRejectedValue(mockError);

    // Call the function and expect it to throw
    await expect(
      getWikis(mockConnection, { projectId: 'testProject' }),
    ).rejects.toThrow(AzureDevOpsError);

    // Assertions
    expect(mockConnection.getWikiApi).toHaveBeenCalledTimes(1);
    expect(mockWikiApi.getAllWikis).toHaveBeenCalledWith('testProject');
  });

  test('should throw ResourceNotFoundError for non-existent project', async () => {
    // Setup mock to throw an error with specific resource not found message
    const mockError = new Error('The resource cannot be found');
    mockWikiApi.getAllWikis.mockRejectedValue(mockError);

    // Call the function and expect it to throw a specific error type
    await expect(
      getWikis(mockConnection, { projectId: 'nonExistentProject' }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);

    // Assertions
    expect(mockConnection.getWikiApi).toHaveBeenCalledTimes(1);
    expect(mockWikiApi.getAllWikis).toHaveBeenCalledWith('nonExistentProject');
  });
});

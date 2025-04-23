import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
  AzureDevOpsPermissionError,
} from '../../../shared/errors';
import { createWiki } from './feature';
import { WikiType } from './schema';
import { getWikiClient } from '../../../clients/azure-devops';

// Mock the WikiClient
jest.mock('../../../clients/azure-devops');

describe('createWiki unit', () => {
  // Mock WikiClient
  const mockWikiClient = {
    createWiki: jest.fn(),
  };

  // Mock WebApi connection (kept for backward compatibility)
  const mockConnection = {} as WebApi;

  beforeEach(() => {
    // Clear mock calls between tests
    jest.clearAllMocks();
    // Setup mock response for getWikiClient
    (getWikiClient as jest.Mock).mockResolvedValue(mockWikiClient);
  });

  test('should create a project wiki', async () => {
    // Mock data
    const mockWiki = {
      id: 'wiki1',
      name: 'Project Wiki',
      projectId: 'project1',
      remoteUrl: 'https://example.com/wiki1',
      url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki1',
      type: 'projectWiki',
      repositoryId: 'repo1',
      mappedPath: '/',
    };

    // Setup mock response
    mockWikiClient.createWiki.mockResolvedValue(mockWiki);

    // Call the function
    const result = await createWiki(mockConnection, {
      name: 'Project Wiki',
      projectId: 'project1',
    });

    // Assertions
    expect(getWikiClient).toHaveBeenCalledWith({ organizationId: undefined });
    expect(mockWikiClient.createWiki).toHaveBeenCalledWith('project1', {
      name: 'Project Wiki',
      projectId: 'project1',
      type: WikiType.ProjectWiki,
    });
    expect(result).toEqual(mockWiki);
  });

  test('should create a code wiki', async () => {
    // Mock data
    const mockWiki = {
      id: 'wiki2',
      name: 'Code Wiki',
      projectId: 'project1',
      repositoryId: 'repo1',
      mappedPath: '/docs',
      remoteUrl: 'https://example.com/wiki2',
      url: 'https://dev.azure.com/org/project/_wiki/wikis/wiki2',
      type: 'codeWiki',
    };

    // Setup mock response
    mockWikiClient.createWiki.mockResolvedValue(mockWiki);

    // Call the function
    const result = await createWiki(mockConnection, {
      name: 'Code Wiki',
      projectId: 'project1',
      type: WikiType.CodeWiki,
      repositoryId: 'repo1',
      mappedPath: '/docs',
    });

    // Assertions
    expect(getWikiClient).toHaveBeenCalledWith({ organizationId: undefined });
    expect(mockWikiClient.createWiki).toHaveBeenCalledWith('project1', {
      name: 'Code Wiki',
      projectId: 'project1',
      type: WikiType.CodeWiki,
      repositoryId: 'repo1',
      mappedPath: '/docs',
      version: {
        version: 'main',
        versionType: 'branch' as const,
      },
    });
    expect(result).toEqual(mockWiki);
  });

  test('should throw validation error when repository ID is missing for code wiki', async () => {
    // Call the function and expect it to throw
    await expect(
      createWiki(mockConnection, {
        name: 'Code Wiki',
        projectId: 'project1',
        type: WikiType.CodeWiki,
        // repositoryId is missing
      }),
    ).rejects.toThrow(AzureDevOpsValidationError);

    // Assertions
    expect(getWikiClient).not.toHaveBeenCalled();
    expect(mockWikiClient.createWiki).not.toHaveBeenCalled();
  });

  test('should handle project not found error', async () => {
    // Setup mock to throw an error
    mockWikiClient.createWiki.mockRejectedValue(
      new AzureDevOpsResourceNotFoundError('Project not found'),
    );

    // Call the function and expect it to throw
    await expect(
      createWiki(mockConnection, {
        name: 'Project Wiki',
        projectId: 'nonExistentProject',
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);

    // Assertions
    expect(getWikiClient).toHaveBeenCalledWith({ organizationId: undefined });
    expect(mockWikiClient.createWiki).toHaveBeenCalled();
  });

  test('should handle repository not found error', async () => {
    // Setup mock to throw an error
    mockWikiClient.createWiki.mockRejectedValue(
      new AzureDevOpsResourceNotFoundError('Repository not found'),
    );

    // Call the function and expect it to throw
    await expect(
      createWiki(mockConnection, {
        name: 'Code Wiki',
        projectId: 'project1',
        type: WikiType.CodeWiki,
        repositoryId: 'nonExistentRepo',
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);

    // Assertions
    expect(getWikiClient).toHaveBeenCalledWith({ organizationId: undefined });
    expect(mockWikiClient.createWiki).toHaveBeenCalled();
  });

  test('should handle permission error', async () => {
    // Setup mock to throw an error
    mockWikiClient.createWiki.mockRejectedValue(
      new AzureDevOpsPermissionError('You do not have permission'),
    );

    // Call the function and expect it to throw
    await expect(
      createWiki(mockConnection, {
        name: 'Project Wiki',
        projectId: 'project1',
      }),
    ).rejects.toThrow(AzureDevOpsPermissionError);

    // Assertions
    expect(getWikiClient).toHaveBeenCalledWith({ organizationId: undefined });
    expect(mockWikiClient.createWiki).toHaveBeenCalled();
  });

  test('should handle generic errors', async () => {
    // Setup mock to throw an error
    mockWikiClient.createWiki.mockRejectedValue(new Error('Unknown error'));

    // Call the function and expect it to throw
    await expect(
      createWiki(mockConnection, {
        name: 'Project Wiki',
        projectId: 'project1',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    // Assertions
    expect(getWikiClient).toHaveBeenCalledWith({ organizationId: undefined });
    expect(mockWikiClient.createWiki).toHaveBeenCalled();
  });
});

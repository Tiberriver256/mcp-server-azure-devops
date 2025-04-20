import axios from 'axios';
import { getWikiPage, GetWikiPageOptions } from './feature';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsPermissionError,
  AzureDevOpsError,
} from '../../../shared/errors';

// Mock Azure Identity
jest.mock('@azure/identity', () => {
  const mockGetToken = jest.fn().mockResolvedValue({ token: 'mock-token' });
  return {
    DefaultAzureCredential: jest.fn().mockImplementation(() => ({
      getToken: mockGetToken,
    })),
    AzureCliCredential: jest.fn().mockImplementation(() => ({
      getToken: mockGetToken,
    })),
  };
});

// Mock axios module
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock getAuthorizationHeader function
jest.mock('./feature', () => {
  const originalModule = jest.requireActual('./feature');
  return {
    ...originalModule,
    getAuthorizationHeader: jest.fn().mockResolvedValue('Bearer mock-token'),
  };
});

describe('getWikiPage unit', () => {
  const mockWikiPageContent = 'Wiki page content text';

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: mockWikiPageContent,
    });
  });

  it('should return wiki page content as text', async () => {
    // Act
    const options: GetWikiPageOptions = {
      organizationId: 'testOrg',
      projectId: 'testProject',
      wikiId: 'testWiki',
      pagePath: '/Home',
    };

    const result = await getWikiPage(options);

    // Assert
    expect(result).toBe(mockWikiPageContent);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://dev.azure.com/testOrg/testProject/_apis/wiki/wikis/testWiki/pages',
      expect.objectContaining({
        params: expect.objectContaining({
          'api-version': '7.0',
          path: '/Home',
        }),
        headers: expect.objectContaining({
          Accept: 'text/plain',
          Authorization: 'Bearer mock-token',
          'Content-Type': 'application/json',
        }),
        responseType: 'text',
      }),
    );
  });

  it('should properly encode wiki page path in URL', async () => {
    // Act
    const options: GetWikiPageOptions = {
      organizationId: 'testOrg',
      projectId: 'testProject',
      wikiId: 'testWiki',
      pagePath: '/Path with spaces/And special chars $&+,/:;=?@',
    };

    await getWikiPage(options);

    // Assert
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://dev.azure.com/testOrg/testProject/_apis/wiki/wikis/testWiki/pages',
      expect.objectContaining({
        params: expect.objectContaining({
          path: '/Path%20with%20spaces/And%20special%20chars%20%24%26%2B%2C/%3A%3B%3D%3F%40',
        }),
      }),
    );
  });

  it('should throw ResourceNotFoundError when wiki page is not found', async () => {
    // Arrange
    mockedAxios.get.mockRejectedValue({
      response: {
        status: 404,
        data: { message: 'Page not found' },
      },
    });

    // Act & Assert
    const options: GetWikiPageOptions = {
      organizationId: 'testOrg',
      projectId: 'testProject',
      wikiId: 'testWiki',
      pagePath: '/NonExistentPage',
    };

    await expect(getWikiPage(options)).rejects.toThrow(
      AzureDevOpsResourceNotFoundError,
    );
  });

  it('should throw PermissionError when user lacks permissions', async () => {
    // Arrange
    mockedAxios.get.mockRejectedValue({
      response: {
        status: 403,
        data: { message: 'Permission denied' },
      },
    });

    // Act & Assert
    const options: GetWikiPageOptions = {
      organizationId: 'testOrg',
      projectId: 'testProject',
      wikiId: 'testWiki',
      pagePath: '/RestrictedPage',
    };

    await expect(getWikiPage(options)).rejects.toThrow(
      AzureDevOpsPermissionError,
    );
  });

  it('should throw generic error for other failures', async () => {
    // Arrange
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    // Act & Assert
    const options: GetWikiPageOptions = {
      organizationId: 'testOrg',
      projectId: 'testProject',
      wikiId: 'testWiki',
      pagePath: '/AnyPage',
    };

    await expect(getWikiPage(options)).rejects.toThrow(AzureDevOpsError);
  });
});

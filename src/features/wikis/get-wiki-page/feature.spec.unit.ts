import { getWikiPage, GetWikiPageOptions } from './feature';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsPermissionError,
  AzureDevOpsError,
} from '../../../shared/errors';
import * as azureDevOpsClient from '../../../clients/azure-devops';

// Mock Azure DevOps client
jest.mock('../../../clients/azure-devops');
const mockGetPage = jest.fn();

(azureDevOpsClient.getWikiClient as jest.Mock).mockImplementation(() => {
  return Promise.resolve({
    getPage: mockGetPage,
  });
});

describe('getWikiPage unit', () => {
  const mockWikiPageContent = 'Wiki page content text';

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPage.mockResolvedValue({ content: mockWikiPageContent });
  });

  it('should return wiki page content as text', async () => {
    // Arrange
    const options: GetWikiPageOptions = {
      organizationId: 'testOrg',
      projectId: 'testProject',
      wikiId: 'testWiki',
      pagePath: '/Home',
    };

    // Act
    const result = await getWikiPage(options);

    // Assert
    expect(result).toBe(mockWikiPageContent);
    expect(azureDevOpsClient.getWikiClient).toHaveBeenCalledWith({
      organizationId: 'testOrg',
    });
    expect(mockGetPage).toHaveBeenCalledWith(
      'testProject',
      'testWiki',
      '/Home',
    );
  });

  it('should properly handle wiki page path', async () => {
    // Arrange
    const options: GetWikiPageOptions = {
      organizationId: 'testOrg',
      projectId: 'testProject',
      wikiId: 'testWiki',
      pagePath: '/Path with spaces/And special chars $&+,/:;=?@',
    };

    // Act
    await getWikiPage(options);

    // Assert
    expect(mockGetPage).toHaveBeenCalledWith(
      'testProject',
      'testWiki',
      '/Path with spaces/And special chars $&+,/:;=?@',
    );
  });

  it('should throw ResourceNotFoundError when wiki page is not found', async () => {
    // Arrange
    mockGetPage.mockRejectedValue(
      new AzureDevOpsResourceNotFoundError('Page not found'),
    );

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
    mockGetPage.mockRejectedValue(
      new AzureDevOpsPermissionError('Permission denied'),
    );

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
    mockGetPage.mockRejectedValue(new Error('Network error'));

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

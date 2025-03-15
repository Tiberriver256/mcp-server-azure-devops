import { WebApi } from 'azure-devops-node-api';
import { GitRepository } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { getPersonalAccessTokenHandler } from 'azure-devops-node-api';
import { getRepository, listRepositories } from '../../../src/operations/repositories';
import { AzureDevOpsResourceNotFoundError } from '../../../src/common/errors';

// Mock the Azure DevOps WebApi and handler
jest.mock('azure-devops-node-api');

describe('Repositories Operations', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockGitApi: any;

  beforeEach(() => {
    // Create mock objects
    mockGitApi = {
      getRepository: jest.fn(),
      getRepositories: jest.fn(),
    };

    // Create a mock handler and WebApi
    const mockHandler = getPersonalAccessTokenHandler('fake-token');
    mockConnection = new WebApi('https://dev.azure.com/organization', mockHandler) as jest.Mocked<WebApi>;
    mockConnection.getGitApi = jest.fn().mockResolvedValue(mockGitApi);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getRepository', () => {
    const mockRepository: GitRepository = {
      id: 'repo-id',
      name: 'Test Repository',
      url: 'https://dev.azure.com/org/project/_git/repo',
      project: {
        id: 'project-id',
        name: 'Test Project',
      },
    };

    it('should return a repository when found', async () => {
      // Arrange
      mockGitApi.getRepository.mockResolvedValue(mockRepository);

      // Act
      const result = await getRepository(mockConnection, 'project-id', 'repo-id');

      // Assert
      expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
      expect(mockGitApi.getRepository).toHaveBeenCalledWith('repo-id', 'project-id');
      expect(result).toEqual(mockRepository);
    });

    it('should throw AzureDevOpsResourceNotFoundError when repository is not found', async () => {
      // Arrange
      mockGitApi.getRepository.mockResolvedValue(null);

      // Act & Assert
      await expect(getRepository(mockConnection, 'project-id', 'non-existent')).rejects.toThrow(
        AzureDevOpsResourceNotFoundError
      );
      expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
      expect(mockGitApi.getRepository).toHaveBeenCalledWith('non-existent', 'project-id');
    });

    it('should propagate AzureDevOpsResourceNotFoundError', async () => {
      // Arrange
      const error = new AzureDevOpsResourceNotFoundError('Repository not found');
      mockGitApi.getRepository.mockRejectedValue(error);

      // Act & Assert
      await expect(getRepository(mockConnection, 'project-id', 'repo-id')).rejects.toThrow(
        AzureDevOpsResourceNotFoundError
      );
    });

    it('should wrap other errors', async () => {
      // Arrange
      mockGitApi.getRepository.mockRejectedValue(new Error('API error'));

      // Act & Assert
      await expect(getRepository(mockConnection, 'project-id', 'repo-id')).rejects.toThrow(
        'Failed to get repository: API error'
      );
    });
  });

  describe('listRepositories', () => {
    const mockRepositories: GitRepository[] = [
      {
        id: 'repo-1',
        name: 'Repository 1',
        url: 'https://dev.azure.com/org/project/_git/repo1',
        project: {
          id: 'project-id',
          name: 'Test Project',
        },
      },
      {
        id: 'repo-2',
        name: 'Repository 2',
        url: 'https://dev.azure.com/org/project/_git/repo2',
        project: {
          id: 'project-id',
          name: 'Test Project',
        },
      },
    ];

    it('should return all repositories for a project', async () => {
      // Arrange
      mockGitApi.getRepositories.mockResolvedValue(mockRepositories);
      const options = {
        projectId: 'project-id',
      };

      // Act
      const result = await listRepositories(mockConnection, options);

      // Assert
      expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
      expect(mockGitApi.getRepositories).toHaveBeenCalledWith('project-id', undefined);
      expect(result).toEqual(mockRepositories);
    });

    it('should pass includeLinks option to the API', async () => {
      // Arrange
      mockGitApi.getRepositories.mockResolvedValue(mockRepositories);
      const options = {
        projectId: 'project-id',
        includeLinks: true,
      };

      // Act
      const result = await listRepositories(mockConnection, options);

      // Assert
      expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
      expect(mockGitApi.getRepositories).toHaveBeenCalledWith('project-id', true);
      expect(result).toEqual(mockRepositories);
    });

    it('should wrap errors', async () => {
      // Arrange
      mockGitApi.getRepositories.mockRejectedValue(new Error('API error'));
      const options = {
        projectId: 'project-id',
      };

      // Act & Assert
      await expect(listRepositories(mockConnection, options)).rejects.toThrow(
        'Failed to list repositories: API error'
      );
    });
  });
}); 
import { WebApi } from 'azure-devops-node-api';
import { GitRepository } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsResourceNotFoundError } from '../../../src/common/errors';
import { getRepository, listRepositories } from '../../../src/operations/repositories';

// Mock the GitApi
const mockGetRepository = jest.fn();
const mockGetRepositories = jest.fn();
const mockGitApi = {
  getRepository: mockGetRepository,
  getRepositories: mockGetRepositories
};

// Mock the WebApi
const mockGetGitApi = jest.fn().mockResolvedValue(mockGitApi);
const mockWebApi = {
  getGitApi: mockGetGitApi
} as unknown as WebApi;

describe('Repositories Operations Coverage Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRepository', () => {
    it('should throw error when repository is null', async () => {
      // Mock getRepository to return null
      mockGetRepository.mockResolvedValueOnce(null);

      await expect(getRepository(mockWebApi, 'project1', 'repo1'))
        .rejects.toThrow(AzureDevOpsResourceNotFoundError);
      
      expect(mockGetRepository).toHaveBeenCalledWith('repo1', 'project1');
    });

    it('should handle non-Error objects in catch block', async () => {
      // Mock getRepository to throw a non-Error object
      mockGetRepository.mockRejectedValueOnce('String error');

      await expect(getRepository(mockWebApi, 'project1', 'repo1'))
        .rejects.toThrow('Failed to get repository: String error');
      
      expect(mockGetRepository).toHaveBeenCalledWith('repo1', 'project1');
    });
  });

  describe('listRepositories', () => {
    it('should pass includeLinks parameter when provided', async () => {
      // Mock getRepositories to return an array of repositories
      const mockRepositories: GitRepository[] = [
        { id: 'repo1', name: 'Repository 1' } as GitRepository
      ];
      mockGetRepositories.mockResolvedValueOnce(mockRepositories);

      const result = await listRepositories(mockWebApi, { 
        projectId: 'project1',
        includeLinks: true
      });

      expect(result).toEqual(mockRepositories);
      expect(mockGetRepositories).toHaveBeenCalledWith('project1', true);
    });

    it('should handle non-Error objects in catch block', async () => {
      // Mock getRepositories to throw a non-Error object
      mockGetRepositories.mockRejectedValueOnce('String error');

      await expect(listRepositories(mockWebApi, { projectId: 'project1' }))
        .rejects.toThrow('Failed to list repositories: String error');
      
      expect(mockGetRepositories).toHaveBeenCalledWith('project1', undefined);
    });
  });
}); 
import { WebApi } from 'azure-devops-node-api';
import { GitRepository } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors';
import { getRepository } from './feature';

// Mock WebApi
jest.mock('azure-devops-node-api');

describe('getRepository', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockGitApi: any;

  const mockRepository: GitRepository = {
    id: 'repo-1',
    name: 'Test Repository',
    url: 'https://dev.azure.com/test/project1/_git/repo1',
    project: {
      id: 'project-1',
      name: 'Test Project',
    },
    defaultBranch: 'refs/heads/main',
    size: 1024,
    remoteUrl: 'https://dev.azure.com/test/project1/_git/repo1',
    sshUrl: 'git@ssh.dev.azure.com:v3/test/project1/repo1',
    webUrl: 'https://dev.azure.com/test/project1/_git/repo1',
  };

  beforeEach(() => {
    mockGitApi = {
      getRepository: jest.fn(),
    };

    // @ts-ignore - Ignoring type checking for the mock
    mockConnection = new WebApi('', {});
    mockConnection.getGitApi = jest.fn().mockResolvedValue(mockGitApi);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should get a repository by id', async () => {
    mockGitApi.getRepository.mockResolvedValue(mockRepository);

    const repository = await getRepository(
      mockConnection,
      'project-1',
      'repo-1',
    );

    expect(mockConnection.getGitApi).toHaveBeenCalled();
    expect(mockGitApi.getRepository).toHaveBeenCalledWith(
      'repo-1',
      'project-1',
    );
    expect(repository).toEqual(mockRepository);
  });

  it('should throw AzureDevOpsResourceNotFoundError when repository is not found', async () => {
    mockGitApi.getRepository.mockResolvedValue(null);

    await expect(
      getRepository(mockConnection, 'project-1', 'non-existent'),
    ).rejects.toThrow(
      new AzureDevOpsResourceNotFoundError(
        "Repository 'non-existent' not found in project 'project-1'",
      ),
    );
  });

  it('should throw an error when the API call fails', async () => {
    const error = new Error('API error');
    mockGitApi.getRepository.mockRejectedValue(error);

    await expect(
      getRepository(mockConnection, 'project-1', 'repo-1'),
    ).rejects.toThrow('Failed to get repository: API error');
  });

  it('should pass through AzureDevOpsError', async () => {
    const error = new AzureDevOpsResourceNotFoundError('Custom error');
    mockGitApi.getRepository.mockRejectedValue(error);

    await expect(
      getRepository(mockConnection, 'project-1', 'repo-1'),
    ).rejects.toThrow(error);
  });
});

import { WebApi } from 'azure-devops-node-api';
import { GitRepository } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import { listRepositories } from './feature';

// Mock WebApi
jest.mock('azure-devops-node-api');

describe('listRepositories', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockGitApi: any;

  const mockRepositories: GitRepository[] = [
    {
      id: 'repo-1',
      name: 'Test Repository 1',
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
    },
    {
      id: 'repo-2',
      name: 'Test Repository 2',
      url: 'https://dev.azure.com/test/project1/_git/repo2',
      project: {
        id: 'project-1',
        name: 'Test Project',
      },
      defaultBranch: 'refs/heads/main',
      size: 2048,
      remoteUrl: 'https://dev.azure.com/test/project1/_git/repo2',
      sshUrl: 'git@ssh.dev.azure.com:v3/test/project1/repo2',
      webUrl: 'https://dev.azure.com/test/project1/_git/repo2',
    },
  ];

  beforeEach(() => {
    mockGitApi = {
      getRepositories: jest.fn(),
    };

    // @ts-ignore - Ignoring type checking for the mock
    mockConnection = new WebApi('', {});
    mockConnection.getGitApi = jest.fn().mockResolvedValue(mockGitApi);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should list repositories in a project', async () => {
    mockGitApi.getRepositories.mockResolvedValue(mockRepositories);

    const repositories = await listRepositories(mockConnection, {
      projectId: 'project-1',
    });

    expect(mockConnection.getGitApi).toHaveBeenCalled();
    expect(mockGitApi.getRepositories).toHaveBeenCalledWith(
      'project-1',
      undefined,
    );
    expect(repositories).toEqual(mockRepositories);
  });

  it('should pass includeLinks option to the API', async () => {
    mockGitApi.getRepositories.mockResolvedValue(mockRepositories);

    await listRepositories(mockConnection, {
      projectId: 'project-1',
      includeLinks: true,
    });

    expect(mockGitApi.getRepositories).toHaveBeenCalledWith('project-1', true);
  });

  it('should throw an error when the API call fails', async () => {
    const error = new Error('API error');
    mockGitApi.getRepositories.mockRejectedValue(error);

    await expect(
      listRepositories(mockConnection, { projectId: 'project-1' }),
    ).rejects.toThrow('Failed to list repositories: API error');
  });

  it('should pass through AzureDevOpsError', async () => {
    const error = new AzureDevOpsError('Custom error');
    mockGitApi.getRepositories.mockRejectedValue(error);

    await expect(
      listRepositories(mockConnection, { projectId: 'project-1' }),
    ).rejects.toThrow(error);
  });

  it('should handle non-Error objects in catch block', async () => {
    // Mock a string error (not an Error instance)
    mockGitApi.getRepositories.mockRejectedValue('String error message');

    await expect(
      listRepositories(mockConnection, { projectId: 'project-1' }),
    ).rejects.toThrow('Failed to list repositories: String error message');
  });
});

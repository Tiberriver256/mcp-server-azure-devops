import { WebApi } from 'azure-devops-node-api';
import { listPullRequests } from './feature';
import { PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';

describe('listPullRequests', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should return pull requests successfully', async () => {
    // Mock data
    const mockPullRequests = [
      {
        pullRequestId: 1,
        title: 'Test PR 1',
        description: 'Test PR description 1',
      },
      {
        pullRequestId: 2,
        title: 'Test PR 2',
        description: 'Test PR description 2',
      },
    ];

    // Setup mock connection
    const mockGitApi = {
      getPullRequests: jest.fn().mockResolvedValue(mockPullRequests),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    // Call the function with test parameters
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const options = {
      projectId,
      repositoryId,
      status: 'active' as const,
      top: 10,
    };

    const result = await listPullRequests(
      mockConnection as WebApi,
      projectId,
      repositoryId,
      options,
    );

    // Verify results
    expect(result).toEqual(mockPullRequests);
    expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
    expect(mockGitApi.getPullRequests).toHaveBeenCalledTimes(1);
    expect(mockGitApi.getPullRequests).toHaveBeenCalledWith(
      repositoryId,
      { status: PullRequestStatus.Active },
      projectId,
      10,
    );
  });

  test('should return empty array when no pull requests exist', async () => {
    // Setup mock connection
    const mockGitApi = {
      getPullRequests: jest.fn().mockResolvedValue(null),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    // Call the function with test parameters
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const options = { projectId, repositoryId };

    const result = await listPullRequests(
      mockConnection as WebApi,
      projectId,
      repositoryId,
      options,
    );

    // Verify results
    expect(result).toEqual([]);
    expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
    expect(mockGitApi.getPullRequests).toHaveBeenCalledTimes(1);
  });

  test('should handle all filter options correctly', async () => {
    // Setup mock connection
    const mockGitApi = {
      getPullRequests: jest.fn().mockResolvedValue([]),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    // Call with all options
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const options = {
      projectId,
      repositoryId,
      status: 'completed' as const,
      creatorId: 'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8',
      reviewerId: 'b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9',
      sourceRefName: 'refs/heads/source-branch',
      targetRefName: 'refs/heads/target-branch',
      top: 5,
      skip: 10,
    };

    await listPullRequests(
      mockConnection as WebApi,
      projectId,
      repositoryId,
      options,
    );

    // Verify the search criteria was constructed correctly
    expect(mockGitApi.getPullRequests).toHaveBeenCalledWith(
      repositoryId,
      {
        status: PullRequestStatus.Completed,
        creatorId: 'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8',
        reviewerId: 'b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9',
        sourceRefName: 'refs/heads/source-branch',
        targetRefName: 'refs/heads/target-branch',
      },
      projectId,
      5,
    );
  });

  test('should throw error when API call fails', async () => {
    // Setup mock connection
    const errorMessage = 'API error';
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => ({
        getPullRequests: jest.fn().mockRejectedValue(new Error(errorMessage)),
      })),
    };

    // Call the function with test parameters
    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const options = { projectId, repositoryId };

    // Verify error handling
    await expect(
      listPullRequests(
        mockConnection as WebApi,
        projectId,
        repositoryId,
        options,
      ),
    ).rejects.toThrow(`Failed to list pull requests: ${errorMessage}`);
  });
});

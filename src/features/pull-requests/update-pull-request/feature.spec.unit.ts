import { updatePullRequest } from './feature';
import { AzureDevOpsClient } from '../../../shared/auth/client-factory';
import { AzureDevOpsError } from '../../../shared/errors';

// Mock the AzureDevOpsClient
jest.mock('../../../shared/auth/client-factory');

describe('updatePullRequest', () => {
  const mockGetPullRequestById = jest.fn();
  const mockUpdatePullRequest = jest.fn();
  const mockGetPullRequestLabels = jest.fn();
  const mockCreatePullRequestLabel = jest.fn();
  const mockDeletePullRequestLabels = jest.fn();
  const mockUpdateWorkItem = jest.fn();
  const mockGetWorkItem = jest.fn();

  // Mock Git API
  const mockGitApi = {
    getPullRequestById: mockGetPullRequestById,
    updatePullRequest: mockUpdatePullRequest,
    getPullRequestLabels: mockGetPullRequestLabels,
    createPullRequestLabel: mockCreatePullRequestLabel,
    deletePullRequestLabels: mockDeletePullRequestLabels,
  };

  // Mock Work Item Tracking API
  const mockWorkItemTrackingApi = {
    updateWorkItem: mockUpdateWorkItem,
    getWorkItem: mockGetWorkItem,
  };

  // Mock connection
  const mockConnection = {
    getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    getWorkItemTrackingApi: jest
      .fn()
      .mockResolvedValue(mockWorkItemTrackingApi),
  };

  const mockAzureDevopsClient = {
    getWebApiClient: jest.fn().mockResolvedValue(mockConnection),
    // ...other properties if needed
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (AzureDevOpsClient as unknown as jest.Mock).mockImplementation(
      () => mockAzureDevopsClient,
    );
    mockGetPullRequestLabels.mockResolvedValue([]);
  });

  it('should throw error when pull request does not exist', async () => {
    mockGetPullRequestById.mockResolvedValueOnce(null);

    await expect(
      updatePullRequest({
        projectId: 'project-1',
        repositoryId: 'repo1',
        pullRequestId: 123,
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });

  it('should update the pull request title and description', async () => {
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
    });

    mockUpdatePullRequest.mockResolvedValueOnce({
      title: 'Updated Title',
      description: 'Updated Description',
    });

    const result = await updatePullRequest({
      projectId: 'project-1',
      repositoryId: 'repo1',
      pullRequestId: 123,
      title: 'Updated Title',
      description: 'Updated Description',
    });

    expect(mockUpdatePullRequest).toHaveBeenCalledWith(
      {
        title: 'Updated Title',
        description: 'Updated Description',
      },
      'repo1',
      123,
      'project-1',
    );

    expect(result).toEqual({
      title: 'Updated Title',
      description: 'Updated Description',
    });
  });

  it('should update the pull request status when status is provided', async () => {
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
    });

    mockUpdatePullRequest.mockResolvedValueOnce({
      status: 2, // Abandoned
    });

    const result = await updatePullRequest({
      projectId: 'project-1',
      repositoryId: 'repo1',
      pullRequestId: 123,
      status: 'abandoned',
    });

    expect(mockUpdatePullRequest).toHaveBeenCalledWith(
      {
        status: 2, // Abandoned value
      },
      'repo1',
      123,
      'project-1',
    );

    expect(result).toEqual({
      status: 2, // Abandoned
    });
  });

  it('should throw error for invalid status', async () => {
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
    });

    await expect(
      updatePullRequest({
        projectId: 'project-1',
        repositoryId: 'repo1',
        pullRequestId: 123,
        status: 'invalid-status' as any,
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });

  it('should update the pull request draft status', async () => {
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
    });

    mockUpdatePullRequest.mockResolvedValueOnce({
      isDraft: true,
    });

    const result = await updatePullRequest({
      projectId: 'project-1',
      repositoryId: 'repo1',
      pullRequestId: 123,
      isDraft: true,
    });

    expect(mockUpdatePullRequest).toHaveBeenCalledWith(
      {
        isDraft: true,
      },
      'repo1',
      123,
      'project-1',
    );

    expect(result).toEqual({
      isDraft: true,
    });
  });

  it('should include additionalProperties in the update', async () => {
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
    });

    mockUpdatePullRequest.mockResolvedValueOnce({
      title: 'Title',
      customProperty: 'custom value',
    });

    const result = await updatePullRequest({
      projectId: 'project-1',
      repositoryId: 'repo1',
      pullRequestId: 123,
      additionalProperties: {
        customProperty: 'custom value',
      },
    });

    expect(mockUpdatePullRequest).toHaveBeenCalledWith(
      {
        customProperty: 'custom value',
      },
      'repo1',
      123,
      'project-1',
    );

    expect(result).toEqual({
      title: 'Title',
      customProperty: 'custom value',
    });
  });

  it('should add new tags to the pull request', async () => {
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
      pullRequestId: 123,
    });

    mockUpdatePullRequest.mockResolvedValueOnce({
      pullRequestId: 123,
    });

    mockGetPullRequestLabels.mockResolvedValueOnce([{ name: 'existing' }]);

    mockCreatePullRequestLabel.mockImplementation(
      async (label: { name: string }) => ({
        name: label.name,
      }),
    );

    const result = await updatePullRequest({
      projectId: 'project-1',
      repositoryId: 'repo1',
      pullRequestId: 123,
      addTags: ['New Tag', 'new tag', 'Another'],
    });

    expect(mockGetPullRequestLabels).toHaveBeenCalledWith(
      'repo1',
      123,
      'project-1',
    );
    expect(mockCreatePullRequestLabel).toHaveBeenCalledTimes(2);
    expect(mockCreatePullRequestLabel).toHaveBeenCalledWith(
      { name: 'New Tag' },
      'repo1',
      123,
      'project-1',
    );
    expect(mockCreatePullRequestLabel).toHaveBeenCalledWith(
      { name: 'Another' },
      'repo1',
      123,
      'project-1',
    );
    expect(result.labels).toEqual([
      { name: 'existing' },
      { name: 'New Tag' },
      { name: 'Another' },
    ]);
  });

  it('should remove tags and ignore missing ones', async () => {
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
      pullRequestId: 123,
    });

    mockUpdatePullRequest.mockResolvedValueOnce({
      pullRequestId: 123,
    });

    mockGetPullRequestLabels.mockResolvedValueOnce([
      { name: 'keep' },
      { name: 'remove' },
    ]);

    mockDeletePullRequestLabels
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ statusCode: 404 });

    const result = await updatePullRequest({
      projectId: 'project-1',
      repositoryId: 'repo1',
      pullRequestId: 123,
      removeTags: ['remove', 'missing'],
    });

    expect(mockDeletePullRequestLabels).toHaveBeenCalledTimes(2);
    expect(mockDeletePullRequestLabels).toHaveBeenCalledWith(
      'repo1',
      123,
      'remove',
      'project-1',
    );
    expect(mockDeletePullRequestLabels).toHaveBeenCalledWith(
      'repo1',
      123,
      'missing',
      'project-1',
    );
    expect(result.labels).toEqual([{ name: 'keep' }]);
  });

  it('should handle work item links', async () => {
    // Define the artifactId that will be used
    const artifactId = 'vstfs:///Git/PullRequestId/project-1/repo1/123';

    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
      artifactId: artifactId, // Add the artifactId to the mock response
    });

    mockUpdatePullRequest.mockResolvedValueOnce({
      pullRequestId: 123,
      repository: { id: 'repo1' },
      artifactId: artifactId,
    });

    // Mocks for work items to remove
    mockGetWorkItem.mockResolvedValueOnce({
      relations: [
        {
          rel: 'ArtifactLink',
          url: artifactId, // Use the same artifactId here
          attributes: {
            name: 'Pull Request',
          },
        },
      ],
    });

    mockGetWorkItem.mockResolvedValueOnce({
      relations: [
        {
          rel: 'ArtifactLink',
          url: artifactId, // Use the same artifactId here
          attributes: {
            name: 'Pull Request',
          },
        },
      ],
    });

    await updatePullRequest({
      projectId: 'project-1',
      repositoryId: 'repo1',
      pullRequestId: 123,
      addWorkItemIds: [456, 789],
      removeWorkItemIds: [101, 202],
    });

    // Check that updateWorkItem was called for adding work items
    expect(mockUpdateWorkItem).toHaveBeenCalledTimes(4); // 2 for add, 2 for remove
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      null,
      [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'ArtifactLink',
            url: 'vstfs:///Git/PullRequestId/project-1/repo1/123',
            attributes: {
              name: 'Pull Request',
            },
          },
        },
      ],
      456,
    );

    // Check for removing work items
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      null,
      [
        {
          op: 'remove',
          path: '/relations/0',
        },
      ],
      101,
    );
  });

  it('should wrap unexpected errors in a friendly error message', async () => {
    mockGetPullRequestById.mockRejectedValueOnce(new Error('Unexpected'));

    await expect(
      updatePullRequest({
        projectId: 'project-1',
        repositoryId: 'repo1',
        pullRequestId: 123,
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });
});

import type { WebApi } from 'azure-devops-node-api';
import { updatePullRequest } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

describe('updatePullRequest', () => {
  const mockGetPullRequestById = jest.fn();
  const mockUpdatePullRequest = jest.fn();
  const mockGetPullRequestLabels = jest.fn();
  const mockCreatePullRequestLabel = jest.fn();
  const mockDeletePullRequestLabels = jest.fn();
  const mockCreatePullRequestReviewer = jest.fn();
  const mockDeletePullRequestReviewer = jest.fn();
  const mockUpdateWorkItem = jest.fn();
  const mockGetWorkItem = jest.fn();

  const mockGitApi = {
    getPullRequestById: mockGetPullRequestById,
    updatePullRequest: mockUpdatePullRequest,
    getPullRequestLabels: mockGetPullRequestLabels,
    createPullRequestLabel: mockCreatePullRequestLabel,
    deletePullRequestLabels: mockDeletePullRequestLabels,
    createPullRequestReviewer: mockCreatePullRequestReviewer,
    deletePullRequestReviewer: mockDeletePullRequestReviewer,
  };

  const mockWorkItemTrackingApi = {
    updateWorkItem: mockUpdateWorkItem,
    getWorkItem: mockGetWorkItem,
  };

  const mockConnection = {
    getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    getWorkItemTrackingApi: jest
      .fn()
      .mockResolvedValue(mockWorkItemTrackingApi),
  } as unknown as WebApi;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPullRequestLabels.mockResolvedValue([]);
  });

  it('should throw error when pull request does not exist', async () => {
    mockGetPullRequestById.mockResolvedValueOnce(null);

    await expect(
      updatePullRequest(
        {
          projectId: 'project-1',
          repositoryId: 'repo1',
          pullRequestId: 123,
        },
        mockConnection,
      ),
    ).rejects.toThrow(AzureDevOpsError);
  });

  it('should update title, description, draft, status, and additionalProperties', async () => {
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
    });

    mockUpdatePullRequest.mockResolvedValueOnce({
      title: 'Updated Title',
      description: 'Updated Description',
      isDraft: true,
      status: 2,
      customProperty: 'custom value',
    });

    const result = await updatePullRequest(
      {
        projectId: 'project-1',
        repositoryId: 'repo1',
        pullRequestId: 123,
        title: 'Updated Title',
        description: 'Updated Description',
        isDraft: true,
        status: 'abandoned',
        additionalProperties: { customProperty: 'custom value' },
      },
      mockConnection,
    );

    expect(mockUpdatePullRequest).toHaveBeenCalledWith(
      {
        title: 'Updated Title',
        description: 'Updated Description',
        isDraft: true,
        status: 2,
        customProperty: 'custom value',
      },
      'repo1',
      123,
      'project-1',
    );
    expect(result).toEqual({
      title: 'Updated Title',
      description: 'Updated Description',
      isDraft: true,
      status: 2,
      customProperty: 'custom value',
    });
  });

  it('should throw error for invalid status', async () => {
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
    });

    await expect(
      updatePullRequest(
        {
          projectId: 'project-1',
          repositoryId: 'repo1',
          pullRequestId: 123,
          status: 'invalid-status' as never,
        },
        mockConnection,
      ),
    ).rejects.toThrow(AzureDevOpsError);
  });

  it('should add deduplicated tags and skip already-existing labels', async () => {
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
      pullRequestId: 123,
    });
    mockUpdatePullRequest.mockResolvedValueOnce({ pullRequestId: 123 });
    mockGetPullRequestLabels.mockResolvedValueOnce([{ name: 'existing' }]);
    mockCreatePullRequestLabel.mockImplementation(
      async (label: { name: string }) => ({ name: label.name }),
    );

    const result = await updatePullRequest(
      {
        projectId: 'project-1',
        repositoryId: 'repo1',
        pullRequestId: 123,
        addTags: ['New Tag', 'new tag', '  existing  ', 'Another'],
      },
      mockConnection,
    );

    expect(mockCreatePullRequestLabel).toHaveBeenCalledTimes(2);
    expect(result.labels).toEqual([
      { name: 'existing' },
      { name: 'New Tag' },
      { name: 'Another' },
    ]);
  });

  it('should remove tags and ignore 404 missing ones', async () => {
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
      pullRequestId: 123,
    });
    mockUpdatePullRequest.mockResolvedValueOnce({ pullRequestId: 123 });
    mockGetPullRequestLabels.mockResolvedValueOnce([
      { name: 'keep' },
      { name: 'remove' },
    ]);
    mockDeletePullRequestLabels
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ statusCode: 404 });

    const result = await updatePullRequest(
      {
        projectId: 'project-1',
        repositoryId: 'repo1',
        pullRequestId: 123,
        removeTags: ['remove', 'missing'],
      },
      mockConnection,
    );

    expect(mockDeletePullRequestLabels).toHaveBeenCalledTimes(2);
    expect(result.labels).toEqual([{ name: 'keep' }]);
  });

  it('should add and remove work item links using a single WIT API client', async () => {
    const artifactId = 'vstfs:///Git/PullRequestId/project-1/repo1/123';
    mockGetPullRequestById.mockResolvedValueOnce({
      repository: { id: 'repo1' },
      artifactId,
    });
    mockUpdatePullRequest.mockResolvedValueOnce({
      pullRequestId: 123,
      repository: { id: 'repo1' },
      artifactId,
    });
    mockGetWorkItem.mockResolvedValue({
      relations: [
        {
          rel: 'ArtifactLink',
          url: artifactId,
          attributes: { name: 'Pull Request' },
        },
      ],
    });

    await updatePullRequest(
      {
        projectId: 'project-1',
        repositoryId: 'repo1',
        pullRequestId: 123,
        addWorkItemIds: [456, 789],
        removeWorkItemIds: [101, 202],
      },
      mockConnection,
    );

    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
    expect(mockUpdateWorkItem).toHaveBeenCalledTimes(4);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      null,
      [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'ArtifactLink',
            url: artifactId,
            attributes: { name: 'Pull Request' },
          },
        },
      ],
      456,
    );
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      null,
      [{ op: 'remove', path: '/relations/0' }],
      101,
    );
  });

  it('logs non-fatal reviewer/work-item removal errors to stderr without touching stdout', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    try {
      mockGetPullRequestById.mockResolvedValueOnce({
        repository: { id: 'repo1' },
      });
      mockUpdatePullRequest.mockResolvedValueOnce({ pullRequestId: 123 });
      mockCreatePullRequestReviewer.mockRejectedValueOnce(
        new Error('reviewer failed'),
      );

      await updatePullRequest(
        {
          projectId: 'project-1',
          repositoryId: 'repo1',
          pullRequestId: 123,
          addReviewers: ['alice@example.com'],
        },
        mockConnection,
      );

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalled();
    } finally {
      consoleLogSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('should wrap unexpected errors in AzureDevOpsError', async () => {
    mockGetPullRequestById.mockRejectedValueOnce(new Error('Unexpected'));

    await expect(
      updatePullRequest(
        {
          projectId: 'project-1',
          repositoryId: 'repo1',
          pullRequestId: 123,
        },
        mockConnection,
      ),
    ).rejects.toThrow(AzureDevOpsError);
  });
});

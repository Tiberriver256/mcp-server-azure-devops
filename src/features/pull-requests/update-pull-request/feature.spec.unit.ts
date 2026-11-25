import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { updatePullRequest } from './feature.ts';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';

type AsyncUnknownFn = (...args: unknown[]) => Promise<unknown>;
type CreateLabelFn = (
  label: { name: string },
  ...args: unknown[]
) => Promise<{ name: string }>;

void describe('updatePullRequest', () => {
  let mockGetPullRequestById: Mock<AsyncUnknownFn>;
  let mockUpdatePullRequest: Mock<AsyncUnknownFn>;
  let mockGetPullRequestLabels: Mock<AsyncUnknownFn>;
  let mockCreatePullRequestLabel: Mock<CreateLabelFn>;
  let mockDeletePullRequestLabels: Mock<AsyncUnknownFn>;
  let mockCreatePullRequestReviewer: Mock<AsyncUnknownFn>;
  let mockDeletePullRequestReviewer: Mock<AsyncUnknownFn>;
  let mockUpdateWorkItem: Mock<AsyncUnknownFn>;
  let mockGetWorkItem: Mock<AsyncUnknownFn>;
  let mockGetGitApi: Mock<() => Promise<unknown>>;
  let mockGetWorkItemTrackingApi: Mock<() => Promise<unknown>>;
  let mockConnection: WebApi;

  beforeEach(() => {
    mockGetPullRequestById = mock.fn<AsyncUnknownFn>(() =>
      Promise.resolve(undefined),
    );
    mockUpdatePullRequest = mock.fn<AsyncUnknownFn>(() =>
      Promise.resolve(undefined),
    );
    mockGetPullRequestLabels = mock.fn<AsyncUnknownFn>(() =>
      Promise.resolve([]),
    );
    mockCreatePullRequestLabel = mock.fn<CreateLabelFn>((label) =>
      Promise.resolve({ name: label.name }),
    );
    mockDeletePullRequestLabels = mock.fn<AsyncUnknownFn>(() =>
      Promise.resolve(undefined),
    );
    mockCreatePullRequestReviewer = mock.fn<AsyncUnknownFn>(() =>
      Promise.resolve(undefined),
    );
    mockDeletePullRequestReviewer = mock.fn<AsyncUnknownFn>(() =>
      Promise.resolve(undefined),
    );
    mockUpdateWorkItem = mock.fn<AsyncUnknownFn>(() =>
      Promise.resolve(undefined),
    );
    mockGetWorkItem = mock.fn<AsyncUnknownFn>(() => Promise.resolve(undefined));

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

    mockGetGitApi = mock.fn(() => Promise.resolve(mockGitApi));
    mockGetWorkItemTrackingApi = mock.fn(() =>
      Promise.resolve(mockWorkItemTrackingApi),
    );

    mockConnection = {
      getGitApi: mockGetGitApi,
      getWorkItemTrackingApi: mockGetWorkItemTrackingApi,
    } as unknown as WebApi;
  });

  afterEach(() => {
    mock.restoreAll();
  });

  void it('should throw error when pull request does not exist', async () => {
    mockGetPullRequestById.mock.mockImplementationOnce(
      () => Promise.resolve(null),
      0,
    );

    await assert.rejects(
      () =>
        updatePullRequest(
          {
            projectId: 'project-1',
            repositoryId: 'repo1',
            pullRequestId: 123,
          },
          mockConnection,
        ),
      AzureDevOpsError,
    );
  });

  void it('should update title, description, draft, status, and additionalProperties', async () => {
    mockGetPullRequestById.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          repository: { id: 'repo1' },
        }),
      0,
    );

    mockUpdatePullRequest.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          title: 'Updated Title',
          description: 'Updated Description',
          isDraft: true,
          status: 2,
          customProperty: 'custom value',
        }),
      0,
    );

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

    assert.strictEqual(mockUpdatePullRequest.mock.callCount(), 1);
    assert.deepStrictEqual(mockUpdatePullRequest.mock.calls[0]?.arguments, [
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
    ]);
    assert.deepStrictEqual(result, {
      title: 'Updated Title',
      description: 'Updated Description',
      isDraft: true,
      status: 2,
      customProperty: 'custom value',
    });
  });

  void it('should throw error for invalid status', async () => {
    mockGetPullRequestById.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          repository: { id: 'repo1' },
        }),
      0,
    );

    await assert.rejects(
      () =>
        updatePullRequest(
          {
            projectId: 'project-1',
            repositoryId: 'repo1',
            pullRequestId: 123,
            status: 'invalid-status' as never,
          },
          mockConnection,
        ),
      AzureDevOpsError,
    );
  });

  void it('should add deduplicated tags and skip already-existing labels', async () => {
    mockGetPullRequestById.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          repository: { id: 'repo1' },
          pullRequestId: 123,
        }),
      0,
    );
    mockUpdatePullRequest.mock.mockImplementationOnce(
      () => Promise.resolve({ pullRequestId: 123 }),
      0,
    );
    mockGetPullRequestLabels.mock.mockImplementationOnce(
      () => Promise.resolve([{ name: 'existing' }]),
      0,
    );
    mockCreatePullRequestLabel.mock.mockImplementation(
      (label: { name: string }) => Promise.resolve({ name: label.name }),
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

    assert.strictEqual(mockCreatePullRequestLabel.mock.callCount(), 2);
    assert.deepStrictEqual(result.labels, [
      { name: 'existing' },
      { name: 'New Tag' },
      { name: 'Another' },
    ]);
  });

  void it('should remove tags and ignore 404 missing ones', async () => {
    mockGetPullRequestById.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          repository: { id: 'repo1' },
          pullRequestId: 123,
        }),
      0,
    );
    mockUpdatePullRequest.mock.mockImplementationOnce(
      () => Promise.resolve({ pullRequestId: 123 }),
      0,
    );
    mockGetPullRequestLabels.mock.mockImplementationOnce(
      () => Promise.resolve([{ name: 'keep' }, { name: 'remove' }]),
      0,
    );
    mockDeletePullRequestLabels.mock.mockImplementationOnce(
      () => Promise.resolve(undefined),
      0,
    );
    mockDeletePullRequestLabels.mock.mockImplementationOnce(async () => {
      throw { statusCode: 404 };
    }, 1);

    const result = await updatePullRequest(
      {
        projectId: 'project-1',
        repositoryId: 'repo1',
        pullRequestId: 123,
        removeTags: ['remove', 'missing'],
      },
      mockConnection,
    );

    assert.strictEqual(mockDeletePullRequestLabels.mock.callCount(), 2);
    assert.deepStrictEqual(result.labels, [{ name: 'keep' }]);
  });

  void it('should add and remove work item links using a single WIT API client', async () => {
    const artifactId = 'vstfs:///Git/PullRequestId/project-1/repo1/123';
    mockGetPullRequestById.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          repository: { id: 'repo1' },
          artifactId,
        }),
      0,
    );
    mockUpdatePullRequest.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          pullRequestId: 123,
          repository: { id: 'repo1' },
          artifactId,
        }),
      0,
    );
    mockGetWorkItem.mock.mockImplementation(() =>
      Promise.resolve({
        relations: [
          {
            rel: 'ArtifactLink',
            url: artifactId,
            attributes: { name: 'Pull Request' },
          },
        ],
      }),
    );

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

    assert.strictEqual(mockGetWorkItemTrackingApi.mock.callCount(), 1);
    assert.strictEqual(mockUpdateWorkItem.mock.callCount(), 4);
    assert.deepStrictEqual(mockUpdateWorkItem.mock.calls[0]?.arguments, [
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
    ]);
    assert.deepStrictEqual(mockUpdateWorkItem.mock.calls[2]?.arguments, [
      null,
      [{ op: 'remove', path: '/relations/0' }],
      101,
    ]);
  });

  void it('logs non-fatal reviewer/work-item removal errors to stderr without touching stdout', async () => {
    const consoleLogSpy = mock.method(console, 'log', () => {});
    const stderrSpy = mock.method(process.stderr, 'write', () => true);

    try {
      mockGetPullRequestById.mock.mockImplementationOnce(
        () =>
          Promise.resolve({
            repository: { id: 'repo1' },
          }),
        0,
      );
      mockUpdatePullRequest.mock.mockImplementationOnce(
        () => Promise.resolve({ pullRequestId: 123 }),
        0,
      );
      mockCreatePullRequestReviewer.mock.mockImplementationOnce(
        () => Promise.reject(new Error('reviewer failed')),
        0,
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

      assert.strictEqual(consoleLogSpy.mock.callCount(), 0);
      assert.ok(stderrSpy.mock.callCount() >= 1);
    } finally {
      consoleLogSpy.mock.restore();
      stderrSpy.mock.restore();
    }
  });

  void it('should wrap unexpected errors in AzureDevOpsError', async () => {
    mockGetPullRequestById.mock.mockImplementationOnce(
      () => Promise.reject(new Error('Unexpected')),
      0,
    );

    await assert.rejects(
      () =>
        updatePullRequest(
          {
            projectId: 'project-1',
            repositoryId: 'repo1',
            pullRequestId: 123,
          },
          mockConnection,
        ),
      AzureDevOpsError,
    );
  });
});

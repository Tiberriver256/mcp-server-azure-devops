import { WebApi } from 'azure-devops-node-api';
import {
  GitPullRequest,
  GitPullRequestMergeStrategy,
  PullRequestAsyncStatus,
  PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import { mergePullRequest } from './feature';

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

describe('mergePullRequest unit', () => {
  const basePr: GitPullRequest = {
    pullRequestId: 42,
    status: PullRequestStatus.Active,
    isDraft: false,
    mergeStatus: PullRequestAsyncStatus.Succeeded,
    lastMergeSourceCommit: { commitId: 'sha-head-123' },
    repository: { id: 'derived-repo-id', name: 'my-repo' },
  };

  let mockGitApi: {
    getPullRequest: jest.Mock;
    getPullRequestById: jest.Mock;
    updatePullRequest: jest.Mock;
  };
  let mockConnection: WebApi;
  let mockConnect: jest.Mock;

  beforeEach(() => {
    mockGitApi = {
      getPullRequest: jest.fn().mockResolvedValue(basePr),
      getPullRequestById: jest.fn().mockResolvedValue(basePr),
      updatePullRequest: jest.fn().mockResolvedValue({
        ...basePr,
        status: PullRequestStatus.Completed,
      }),
    };
    mockConnect = jest.fn().mockResolvedValue({
      authenticatedUser: { id: 'auth-user-guid-999' },
    });
    mockConnection = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
      connect: mockConnect,
    } as unknown as WebApi;
  });

  describe('immediate completion', () => {
    it.each([
      ['noFastForward', GitPullRequestMergeStrategy.NoFastForward],
      ['squash', GitPullRequestMergeStrategy.Squash],
      ['rebase', GitPullRequestMergeStrategy.Rebase],
      ['rebaseMerge', GitPullRequestMergeStrategy.RebaseMerge],
    ] as const)(
      'should complete a pull request using %s mergeStrategy',
      async (strategyName, expectedEnum) => {
        const result = await mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
          mergeStrategy: strategyName,
        });

        expect(mockGitApi.getPullRequest).toHaveBeenCalledWith(
          'explicit-repo-id',
          42,
          'my-project',
        );
        expect(mockGitApi.getPullRequestById).not.toHaveBeenCalled();

        const [patch, repoId, prId, project] =
          mockGitApi.updatePullRequest.mock.calls[0];
        expect(repoId).toBe('explicit-repo-id');
        expect(prId).toBe(42);
        expect(project).toBe('my-project');
        expect(patch).toEqual({
          status: PullRequestStatus.Completed,
          lastMergeSourceCommit: { commitId: 'sha-head-123' },
          completionOptions: {
            mergeStrategy: expectedEnum,
          },
        });
        expect(patch).not.toHaveProperty('isDraft');
        expect(patch.completionOptions).not.toHaveProperty('squashMerge');
        expect(result.status).toBe(PullRequestStatus.Completed);
      },
    );

    it('should omit completionOptions when no completion options are supplied', async () => {
      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        repositoryId: 'explicit-repo-id',
        pullRequestId: 42,
      });

      const [patch] = mockGitApi.updatePullRequest.mock.calls[0];
      expect(patch).toEqual({
        status: PullRequestStatus.Completed,
        lastMergeSourceCommit: { commitId: 'sha-head-123' },
      });
      expect(patch).not.toHaveProperty('completionOptions');
      expect(patch).not.toHaveProperty('isDraft');
    });

    it('should derive repositoryId via getPullRequestById when repositoryId is omitted', async () => {
      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        pullRequestId: 42,
        mergeStrategy: 'squash',
      });

      expect(mockGitApi.getPullRequestById).toHaveBeenCalledWith(
        42,
        'my-project',
      );
      expect(mockGitApi.getPullRequest).not.toHaveBeenCalled();
      expect(mockGitApi.updatePullRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PullRequestStatus.Completed,
          lastMergeSourceCommit: { commitId: 'sha-head-123' },
        }),
        'derived-repo-id',
        42,
        'my-project',
      );
    });

    it('should forward deleteSourceBranch, transitionWorkItems, mergeCommitMessage, bypassPolicy, and bypassReason', async () => {
      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        repositoryId: 'explicit-repo-id',
        pullRequestId: 42,
        mergeStrategy: 'squash',
        deleteSourceBranch: true,
        transitionWorkItems: true,
        mergeCommitMessage: 'feat: custom merge commit message',
        bypassPolicy: true,
        bypassReason: 'Emergency production hotfix',
      });

      const [patch] = mockGitApi.updatePullRequest.mock.calls[0];
      expect(patch).toEqual({
        status: PullRequestStatus.Completed,
        lastMergeSourceCommit: { commitId: 'sha-head-123' },
        completionOptions: {
          mergeStrategy: GitPullRequestMergeStrategy.Squash,
          deleteSourceBranch: true,
          transitionWorkItems: true,
          mergeCommitMessage: 'feat: custom merge commit message',
          bypassPolicy: true,
          bypassReason: 'Emergency production hotfix',
        },
      });
      expect(patch).not.toHaveProperty('isDraft');
      expect(patch.completionOptions).not.toHaveProperty('squashMerge');
    });

    it('should succeed when explicit lastMergeSourceCommitId matches current PR commit', async () => {
      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        repositoryId: 'explicit-repo-id',
        pullRequestId: 42,
        lastMergeSourceCommitId: 'sha-head-123',
      });

      expect(mockGitApi.updatePullRequest).toHaveBeenCalledWith(
        {
          status: PullRequestStatus.Completed,
          lastMergeSourceCommit: { commitId: 'sha-head-123' },
        },
        'explicit-repo-id',
        42,
        'my-project',
      );
    });

    it('should use explicit lastMergeSourceCommitId when PR has no lastMergeSourceCommit', async () => {
      mockGitApi.getPullRequest.mockResolvedValue({
        ...basePr,
        lastMergeSourceCommit: undefined,
      });

      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        repositoryId: 'explicit-repo-id',
        pullRequestId: 42,
        lastMergeSourceCommitId: 'caller-pinned-sha',
      });

      expect(mockGitApi.updatePullRequest).toHaveBeenCalledWith(
        {
          status: PullRequestStatus.Completed,
          lastMergeSourceCommit: { commitId: 'caller-pinned-sha' },
        },
        'explicit-repo-id',
        42,
        'my-project',
      );
    });

    it('should throw AzureDevOpsValidationError on stale lastMergeSourceCommitId mismatch', async () => {
      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
          lastMergeSourceCommitId: 'stale-sha-000',
        }),
      ).rejects.toThrow(AzureDevOpsValidationError);

      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
          lastMergeSourceCommitId: 'stale-sha-000',
        }),
      ).rejects.toThrow(/stale-sha-000.*sha-head-123/);

      expect(mockGitApi.updatePullRequest).not.toHaveBeenCalled();
    });
  });

  describe('auto-complete mode', () => {
    it('should enable auto-complete using connection.connect() authenticatedUser.id', async () => {
      mockGitApi.updatePullRequest.mockResolvedValue({
        ...basePr,
        autoCompleteSetBy: { id: 'auth-user-guid-999' },
      });

      const result = await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        pullRequestId: 42,
        autoComplete: true,
        mergeStrategy: 'squash',
        deleteSourceBranch: true,
        autoCompleteIgnoreConfigIds: [10, 20],
      });

      expect(mockConnect).toHaveBeenCalledTimes(1);
      const [patch, repoId, prId, project] =
        mockGitApi.updatePullRequest.mock.calls[0];
      expect(repoId).toBe('derived-repo-id');
      expect(prId).toBe(42);
      expect(project).toBe('my-project');
      expect(patch).toEqual({
        autoCompleteSetBy: { id: 'auth-user-guid-999' },
        completionOptions: {
          mergeStrategy: GitPullRequestMergeStrategy.Squash,
          deleteSourceBranch: true,
          autoCompleteIgnoreConfigIds: [10, 20],
        },
      });
      expect(patch).not.toHaveProperty('status');
      expect(patch).not.toHaveProperty('lastMergeSourceCommit');
      expect(patch).not.toHaveProperty('isDraft');
      expect(result.autoCompleteSetBy?.id).toBe('auth-user-guid-999');
    });

    it('should omit completionOptions when enabling auto-complete without extra options', async () => {
      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        repositoryId: 'explicit-repo-id',
        pullRequestId: 42,
        autoComplete: true,
      });

      const [patch] = mockGitApi.updatePullRequest.mock.calls[0];
      expect(patch).toEqual({
        autoCompleteSetBy: { id: 'auth-user-guid-999' },
      });
      expect(patch).not.toHaveProperty('completionOptions');
    });

    it('should throw AzureDevOpsAuthenticationError if connection.connect() has no authenticatedUser.id', async () => {
      mockConnect.mockResolvedValue({ authenticatedUser: {} });

      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
          autoComplete: true,
        }),
      ).rejects.toThrow(AzureDevOpsAuthenticationError);

      expect(mockGitApi.updatePullRequest).not.toHaveBeenCalled();
    });

    it('should cancel auto-complete by sending ONLY empty GUID autoCompleteSetBy', async () => {
      mockGitApi.updatePullRequest.mockResolvedValue({
        ...basePr,
        autoCompleteSetBy: undefined,
      });

      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        repositoryId: 'explicit-repo-id',
        pullRequestId: 42,
        autoComplete: false,
        mergeStrategy: 'squash',
        deleteSourceBranch: true,
      });

      expect(mockConnect).not.toHaveBeenCalled();
      const [patch] = mockGitApi.updatePullRequest.mock.calls[0];
      expect(patch).toEqual({
        autoCompleteSetBy: { id: EMPTY_GUID },
      });
      expect(Object.keys(patch)).toEqual(['autoCompleteSetBy']);
      expect(patch.autoCompleteSetBy).not.toBeNull();
      expect(patch).not.toHaveProperty('completionOptions');
      expect(patch).not.toHaveProperty('status');
      expect(patch).not.toHaveProperty('isDraft');
    });
  });

  describe('precondition validation', () => {
    it('should throw AzureDevOpsResourceNotFoundError when pull request is not found', async () => {
      mockGitApi.getPullRequestById.mockResolvedValue(undefined);

      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          pullRequestId: 404,
        }),
      ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
      expect(mockGitApi.updatePullRequest).not.toHaveBeenCalled();
    });

    it('should throw AzureDevOpsValidationError when repositoryId cannot be resolved', async () => {
      mockGitApi.getPullRequestById.mockResolvedValue({
        ...basePr,
        repository: undefined,
      });

      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          pullRequestId: 42,
        }),
      ).rejects.toThrow(AzureDevOpsValidationError);
      expect(mockGitApi.updatePullRequest).not.toHaveBeenCalled();
    });

    it.each([
      [PullRequestStatus.Completed, 'completed'],
      [PullRequestStatus.Abandoned, 'abandoned'],
    ])(
      'should throw AzureDevOpsValidationError when pull request status is %s',
      async (status, label) => {
        mockGitApi.getPullRequest.mockResolvedValue({
          ...basePr,
          status,
        });

        await expect(
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
          }),
        ).rejects.toThrow(AzureDevOpsValidationError);

        await expect(
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
          }),
        ).rejects.toThrow(new RegExp(label));

        expect(mockGitApi.updatePullRequest).not.toHaveBeenCalled();
      },
    );

    it('should throw AzureDevOpsValidationError when trying to immediately merge a draft PR', async () => {
      mockGitApi.getPullRequest.mockResolvedValue({
        ...basePr,
        isDraft: true,
      });

      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
        }),
      ).rejects.toThrow(AzureDevOpsValidationError);

      expect(mockGitApi.updatePullRequest).not.toHaveBeenCalled();
    });

    it('should throw AzureDevOpsValidationError when PR has merge conflicts', async () => {
      mockGitApi.getPullRequest.mockResolvedValue({
        ...basePr,
        mergeStatus: PullRequestAsyncStatus.Conflicts,
        mergeFailureMessage: 'Conflict in src/app.ts',
      });

      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
        }),
      ).rejects.toThrow(/merge conflicts.*Conflict in src\/app\.ts/);

      expect(mockGitApi.updatePullRequest).not.toHaveBeenCalled();
    });

    it('should throw AzureDevOpsValidationError including mergeStatus and mergeFailureMessage when lastMergeSourceCommit is missing', async () => {
      mockGitApi.getPullRequest.mockResolvedValue({
        ...basePr,
        lastMergeSourceCommit: undefined,
        mergeStatus: PullRequestAsyncStatus.Queued,
        mergeFailureMessage: 'Merge calculation pending',
      });

      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
        }),
      ).rejects.toThrow(
        /no lastMergeSourceCommit.*queued.*Merge calculation pending/,
      );

      expect(mockGitApi.updatePullRequest).not.toHaveBeenCalled();
    });

    it('should reject bypassReason when bypassPolicy is not true', async () => {
      await expect(
        mergePullRequest(mockConnection, {
          pullRequestId: 42,
          bypassReason: 'reason without flag',
        }),
      ).rejects.toThrow(AzureDevOpsValidationError);
      expect(mockGitApi.updatePullRequest).not.toHaveBeenCalled();
    });

    it('should reject bypassPolicy when autoComplete is false', async () => {
      await expect(
        mergePullRequest(mockConnection, {
          pullRequestId: 42,
          autoComplete: false,
          bypassPolicy: true,
        }),
      ).rejects.toThrow(AzureDevOpsValidationError);
      expect(mockGitApi.updatePullRequest).not.toHaveBeenCalled();
    });

    it('should reject autoCompleteIgnoreConfigIds when autoComplete is not true', async () => {
      await expect(
        mergePullRequest(mockConnection, {
          pullRequestId: 42,
          autoCompleteIgnoreConfigIds: [1],
        }),
      ).rejects.toThrow(AzureDevOpsValidationError);
      expect(mockGitApi.updatePullRequest).not.toHaveBeenCalled();
    });

    it('should throw AzureDevOpsError when updatePullRequest returns empty result', async () => {
      mockGitApi.updatePullRequest.mockResolvedValue(undefined);

      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
        }),
      ).rejects.toThrow(AzureDevOpsError);
    });
  });

  describe('HTTP error mapping', () => {
    it('should map 401 statusCode to AzureDevOpsAuthenticationError', async () => {
      const apiError = Object.assign(new Error('Unauthorized'), {
        statusCode: 401,
      });
      mockGitApi.updatePullRequest.mockRejectedValue(apiError);

      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
        }),
      ).rejects.toThrow(AzureDevOpsAuthenticationError);
    });

    it('should map 403 statusCode to AzureDevOpsPermissionError', async () => {
      const apiError = Object.assign(new Error('Forbidden'), {
        statusCode: 403,
      });
      mockGitApi.updatePullRequest.mockRejectedValue(apiError);

      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
        }),
      ).rejects.toThrow(AzureDevOpsPermissionError);
    });

    it('should map 404 response.status to AzureDevOpsResourceNotFoundError', async () => {
      const apiError = Object.assign(new Error('Not Found'), {
        response: { status: 404 },
      });
      mockGitApi.getPullRequest.mockRejectedValue(apiError);

      await expect(
        mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
        }),
      ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
    });

    it.each([400, 409])(
      'should map %i statusCode to AzureDevOpsValidationError',
      async (statusCode) => {
        const apiError = Object.assign(new Error('Policy rejected'), {
          statusCode,
        });
        mockGitApi.updatePullRequest.mockRejectedValue(apiError);

        await expect(
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
          }),
        ).rejects.toThrow(AzureDevOpsValidationError);
      },
    );

    it('should wrap unknown errors in AzureDevOpsError with cause', async () => {
      const rootCause = new Error('Socket hang up');
      mockGitApi.updatePullRequest.mockRejectedValue(rootCause);

      let caught: unknown;
      try {
        await mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(AzureDevOpsError);
      expect((caught as AzureDevOpsError).cause).toBe(rootCause);
    });
  });
});

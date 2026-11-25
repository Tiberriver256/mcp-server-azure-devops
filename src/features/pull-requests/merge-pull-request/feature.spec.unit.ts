import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import type { GitPullRequest } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  GitPullRequestMergeStrategy,
  PullRequestAsyncStatus,
  PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { mergePullRequest } from './feature.ts';

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

type GetPullRequestFn = (
  repositoryId: string,
  pullRequestId: number,
  project?: string,
) => Promise<GitPullRequest | undefined>;
type GetPullRequestByIdFn = (
  pullRequestId: number,
  project?: string,
) => Promise<GitPullRequest | undefined>;
type UpdatePullRequestFn = (
  patch: GitPullRequest,
  repositoryId: string,
  pullRequestId: number,
  project?: string,
) => Promise<GitPullRequest | undefined>;
type ConnectFn = () => Promise<{ authenticatedUser?: { id?: string } }>;

void describe('mergePullRequest unit', () => {
  const basePr: GitPullRequest = {
    pullRequestId: 42,
    status: PullRequestStatus.Active,
    isDraft: false,
    mergeStatus: PullRequestAsyncStatus.Succeeded,
    lastMergeSourceCommit: { commitId: 'sha-head-123' },
    repository: { id: 'derived-repo-id', name: 'my-repo' },
  };

  let mockGitApi: {
    getPullRequest: Mock<GetPullRequestFn>;
    getPullRequestById: Mock<GetPullRequestByIdFn>;
    updatePullRequest: Mock<UpdatePullRequestFn>;
  };
  let mockConnection: WebApi;
  let mockConnect: Mock<ConnectFn>;

  beforeEach(() => {
    mockGitApi = {
      getPullRequest: mock.fn<GetPullRequestFn>(() => Promise.resolve(basePr)),
      getPullRequestById: mock.fn<GetPullRequestByIdFn>(() =>
        Promise.resolve(basePr),
      ),
      updatePullRequest: mock.fn<UpdatePullRequestFn>(() =>
        Promise.resolve({
          ...basePr,
          status: PullRequestStatus.Completed,
        }),
      ),
    };
    mockConnect = mock.fn<ConnectFn>(() =>
      Promise.resolve({
        authenticatedUser: { id: 'auth-user-guid-999' },
      }),
    );
    mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
      connect: mockConnect,
    } as unknown as WebApi;
  });

  void describe('immediate completion', () => {
    const mergeStrategyCases = [
      ['noFastForward', GitPullRequestMergeStrategy.NoFastForward],
      ['squash', GitPullRequestMergeStrategy.Squash],
      ['rebase', GitPullRequestMergeStrategy.Rebase],
      ['rebaseMerge', GitPullRequestMergeStrategy.RebaseMerge],
    ] as const;

    for (const [strategyName, expectedEnum] of mergeStrategyCases) {
      void it(`should complete a pull request using ${strategyName} mergeStrategy`, async () => {
        const result = await mergePullRequest(mockConnection, {
          projectId: 'my-project',
          repositoryId: 'explicit-repo-id',
          pullRequestId: 42,
          mergeStrategy: strategyName,
        });

        assert.strictEqual(mockGitApi.getPullRequest.mock.callCount(), 1);
        assert.deepStrictEqual(
          mockGitApi.getPullRequest.mock.calls[0]?.arguments,
          ['explicit-repo-id', 42, 'my-project'],
        );
        assert.strictEqual(mockGitApi.getPullRequestById.mock.callCount(), 0);

        assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 1);
        const callArgs = mockGitApi.updatePullRequest.mock.calls[0]?.arguments;
        assert.ok(callArgs);
        const [patch, repoId, prId, project] = callArgs;
        assert.strictEqual(repoId, 'explicit-repo-id');
        assert.strictEqual(prId, 42);
        assert.strictEqual(project, 'my-project');
        assert.deepStrictEqual(patch, {
          status: PullRequestStatus.Completed,
          lastMergeSourceCommit: { commitId: 'sha-head-123' },
          completionOptions: {
            mergeStrategy: expectedEnum,
          },
        });
        assert.strictEqual(Object.hasOwn(patch, 'isDraft'), false);
        assert.ok(patch.completionOptions);
        assert.strictEqual(
          Object.hasOwn(patch.completionOptions, 'squashMerge'),
          false,
        );
        assert.strictEqual(result.status, PullRequestStatus.Completed);
      });
    }

    void it('should omit completionOptions when no completion options are supplied', async () => {
      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        repositoryId: 'explicit-repo-id',
        pullRequestId: 42,
      });

      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 1);
      const callArgs = mockGitApi.updatePullRequest.mock.calls[0]?.arguments;
      assert.ok(callArgs);
      const [patch] = callArgs;
      assert.deepStrictEqual(patch, {
        status: PullRequestStatus.Completed,
        lastMergeSourceCommit: { commitId: 'sha-head-123' },
      });
      assert.strictEqual(Object.hasOwn(patch, 'completionOptions'), false);
      assert.strictEqual(Object.hasOwn(patch, 'isDraft'), false);
    });

    void it('should derive repositoryId via getPullRequestById when repositoryId is omitted', async () => {
      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        pullRequestId: 42,
        mergeStrategy: 'squash',
      });

      assert.strictEqual(mockGitApi.getPullRequestById.mock.callCount(), 1);
      assert.deepStrictEqual(
        mockGitApi.getPullRequestById.mock.calls[0]?.arguments,
        [42, 'my-project'],
      );
      assert.strictEqual(mockGitApi.getPullRequest.mock.callCount(), 0);
      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 1);
      const callArgs = mockGitApi.updatePullRequest.mock.calls[0]?.arguments;
      assert.ok(callArgs);
      assert.strictEqual(callArgs.length, 4);
      assert.partialDeepStrictEqual(callArgs[0], {
        status: PullRequestStatus.Completed,
        lastMergeSourceCommit: { commitId: 'sha-head-123' },
      });
      assert.deepStrictEqual(callArgs.slice(1), [
        'derived-repo-id',
        42,
        'my-project',
      ]);
    });

    void it('should forward deleteSourceBranch, transitionWorkItems, mergeCommitMessage, bypassPolicy, and bypassReason', async () => {
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

      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 1);
      const callArgs = mockGitApi.updatePullRequest.mock.calls[0]?.arguments;
      assert.ok(callArgs);
      const [patch] = callArgs;
      assert.deepStrictEqual(patch, {
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
      assert.strictEqual(Object.hasOwn(patch, 'isDraft'), false);
      assert.ok(patch.completionOptions);
      assert.strictEqual(
        Object.hasOwn(patch.completionOptions, 'squashMerge'),
        false,
      );
    });

    void it('should succeed when explicit lastMergeSourceCommitId matches current PR commit', async () => {
      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        repositoryId: 'explicit-repo-id',
        pullRequestId: 42,
        lastMergeSourceCommitId: 'sha-head-123',
      });

      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 1);
      assert.deepStrictEqual(
        mockGitApi.updatePullRequest.mock.calls[0]?.arguments,
        [
          {
            status: PullRequestStatus.Completed,
            lastMergeSourceCommit: { commitId: 'sha-head-123' },
          },
          'explicit-repo-id',
          42,
          'my-project',
        ],
      );
    });

    void it('should use explicit lastMergeSourceCommitId when PR has no lastMergeSourceCommit', async () => {
      mockGitApi.getPullRequest.mock.mockImplementation(() =>
        Promise.resolve({
          ...basePr,
          lastMergeSourceCommit: undefined,
        }),
      );

      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        repositoryId: 'explicit-repo-id',
        pullRequestId: 42,
        lastMergeSourceCommitId: 'caller-pinned-sha',
      });

      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 1);
      assert.deepStrictEqual(
        mockGitApi.updatePullRequest.mock.calls[0]?.arguments,
        [
          {
            status: PullRequestStatus.Completed,
            lastMergeSourceCommit: { commitId: 'caller-pinned-sha' },
          },
          'explicit-repo-id',
          42,
          'my-project',
        ],
      );
    });

    void it('should throw AzureDevOpsValidationError on stale lastMergeSourceCommitId mismatch', async () => {
      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
            lastMergeSourceCommitId: 'stale-sha-000',
          }),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsValidationError);
          assert.match(err.message, /stale-sha-000.*sha-head-123/);
          return true;
        },
      );

      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 0);
    });
  });

  void describe('auto-complete mode', () => {
    void it('should enable auto-complete using connection.connect() authenticatedUser.id', async () => {
      mockGitApi.updatePullRequest.mock.mockImplementation(() =>
        Promise.resolve({
          ...basePr,
          autoCompleteSetBy: { id: 'auth-user-guid-999' },
        }),
      );

      const result = await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        pullRequestId: 42,
        autoComplete: true,
        mergeStrategy: 'squash',
        deleteSourceBranch: true,
        autoCompleteIgnoreConfigIds: [10, 20],
      });

      assert.strictEqual(mockConnect.mock.callCount(), 1);
      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 1);
      const callArgs = mockGitApi.updatePullRequest.mock.calls[0]?.arguments;
      assert.ok(callArgs);
      const [patch, repoId, prId, project] = callArgs;
      assert.strictEqual(repoId, 'derived-repo-id');
      assert.strictEqual(prId, 42);
      assert.strictEqual(project, 'my-project');
      assert.deepStrictEqual(patch, {
        autoCompleteSetBy: { id: 'auth-user-guid-999' },
        completionOptions: {
          mergeStrategy: GitPullRequestMergeStrategy.Squash,
          deleteSourceBranch: true,
          autoCompleteIgnoreConfigIds: [10, 20],
        },
      });
      assert.strictEqual(Object.hasOwn(patch, 'status'), false);
      assert.strictEqual(Object.hasOwn(patch, 'lastMergeSourceCommit'), false);
      assert.strictEqual(Object.hasOwn(patch, 'isDraft'), false);
      assert.strictEqual(result.autoCompleteSetBy?.id, 'auth-user-guid-999');
    });

    void it('should omit completionOptions when enabling auto-complete without extra options', async () => {
      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        repositoryId: 'explicit-repo-id',
        pullRequestId: 42,
        autoComplete: true,
      });

      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 1);
      const callArgs = mockGitApi.updatePullRequest.mock.calls[0]?.arguments;
      assert.ok(callArgs);
      const [patch] = callArgs;
      assert.deepStrictEqual(patch, {
        autoCompleteSetBy: { id: 'auth-user-guid-999' },
      });
      assert.strictEqual(Object.hasOwn(patch, 'completionOptions'), false);
    });

    void it('should throw AzureDevOpsAuthenticationError if connection.connect() has no authenticatedUser.id', async () => {
      mockConnect.mock.mockImplementation(() =>
        Promise.resolve({ authenticatedUser: {} }),
      );

      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
            autoComplete: true,
          }),
        AzureDevOpsAuthenticationError,
      );

      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 0);
    });

    void it('should cancel auto-complete by sending ONLY empty GUID autoCompleteSetBy', async () => {
      mockGitApi.updatePullRequest.mock.mockImplementation(() =>
        Promise.resolve({
          ...basePr,
          autoCompleteSetBy: undefined,
        }),
      );

      await mergePullRequest(mockConnection, {
        projectId: 'my-project',
        repositoryId: 'explicit-repo-id',
        pullRequestId: 42,
        autoComplete: false,
        mergeStrategy: 'squash',
        deleteSourceBranch: true,
      });

      assert.strictEqual(mockConnect.mock.callCount(), 0);
      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 1);
      const callArgs = mockGitApi.updatePullRequest.mock.calls[0]?.arguments;
      assert.ok(callArgs);
      const [patch] = callArgs;
      assert.deepStrictEqual(patch, {
        autoCompleteSetBy: { id: EMPTY_GUID },
      });
      assert.deepStrictEqual(Object.keys(patch), ['autoCompleteSetBy']);
      assert.notStrictEqual(patch.autoCompleteSetBy, null);
      assert.strictEqual(Object.hasOwn(patch, 'completionOptions'), false);
      assert.strictEqual(Object.hasOwn(patch, 'status'), false);
      assert.strictEqual(Object.hasOwn(patch, 'isDraft'), false);
    });
  });

  void describe('precondition validation', () => {
    void it('should throw AzureDevOpsResourceNotFoundError when pull request is not found', async () => {
      mockGitApi.getPullRequestById.mock.mockImplementation(() =>
        Promise.resolve(undefined),
      );

      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            pullRequestId: 404,
          }),
        AzureDevOpsResourceNotFoundError,
      );
      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 0);
    });

    void it('should throw AzureDevOpsValidationError when repositoryId cannot be resolved', async () => {
      mockGitApi.getPullRequestById.mock.mockImplementation(() =>
        Promise.resolve({
          ...basePr,
          repository: undefined,
        }),
      );

      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            pullRequestId: 42,
          }),
        AzureDevOpsValidationError,
      );
      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 0);
    });

    const inactiveStatusCases = [
      [PullRequestStatus.Completed, 'completed'],
      [PullRequestStatus.Abandoned, 'abandoned'],
    ] as const;

    for (const [status, label] of inactiveStatusCases) {
      void it(`should throw AzureDevOpsValidationError when pull request status is ${status}`, async () => {
        mockGitApi.getPullRequest.mock.mockImplementation(() =>
          Promise.resolve({
            ...basePr,
            status,
          }),
        );

        await assert.rejects(
          () =>
            mergePullRequest(mockConnection, {
              projectId: 'my-project',
              repositoryId: 'explicit-repo-id',
              pullRequestId: 42,
            }),
          (err: unknown) => {
            assert.ok(err instanceof AzureDevOpsValidationError);
            assert.match(err.message, new RegExp(label));
            return true;
          },
        );

        assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 0);
      });
    }

    void it('should throw AzureDevOpsValidationError when trying to immediately merge a draft PR', async () => {
      mockGitApi.getPullRequest.mock.mockImplementation(() =>
        Promise.resolve({
          ...basePr,
          isDraft: true,
        }),
      );

      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
          }),
        AzureDevOpsValidationError,
      );

      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 0);
    });

    void it('should throw AzureDevOpsValidationError when PR has merge conflicts', async () => {
      mockGitApi.getPullRequest.mock.mockImplementation(() =>
        Promise.resolve({
          ...basePr,
          mergeStatus: PullRequestAsyncStatus.Conflicts,
          mergeFailureMessage: 'Conflict in src/app.ts',
        }),
      );

      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
          }),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsValidationError);
          assert.match(
            err.message,
            /merge conflicts.*Conflict in src\/app\.ts/,
          );
          return true;
        },
      );

      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 0);
    });

    void it('should throw AzureDevOpsValidationError including mergeStatus and mergeFailureMessage when lastMergeSourceCommit is missing', async () => {
      mockGitApi.getPullRequest.mock.mockImplementation(() =>
        Promise.resolve({
          ...basePr,
          lastMergeSourceCommit: undefined,
          mergeStatus: PullRequestAsyncStatus.Queued,
          mergeFailureMessage: 'Merge calculation pending',
        }),
      );

      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
          }),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsValidationError);
          assert.match(
            err.message,
            /no lastMergeSourceCommit.*queued.*Merge calculation pending/,
          );
          return true;
        },
      );

      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 0);
    });

    void it('should reject bypassReason when bypassPolicy is not true', async () => {
      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            pullRequestId: 42,
            bypassReason: 'reason without flag',
          }),
        AzureDevOpsValidationError,
      );
      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 0);
    });

    void it('should reject bypassPolicy when autoComplete is false', async () => {
      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            pullRequestId: 42,
            autoComplete: false,
            bypassPolicy: true,
          }),
        AzureDevOpsValidationError,
      );
      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 0);
    });

    void it('should reject autoCompleteIgnoreConfigIds when autoComplete is not true', async () => {
      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            pullRequestId: 42,
            autoCompleteIgnoreConfigIds: [1],
          }),
        AzureDevOpsValidationError,
      );
      assert.strictEqual(mockGitApi.updatePullRequest.mock.callCount(), 0);
    });

    void it('should throw AzureDevOpsError when updatePullRequest returns empty result', async () => {
      mockGitApi.updatePullRequest.mock.mockImplementation(() =>
        Promise.resolve(undefined),
      );

      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
          }),
        AzureDevOpsError,
      );
    });
  });

  void describe('HTTP error mapping', () => {
    void it('should map 401 statusCode to AzureDevOpsAuthenticationError', async () => {
      const apiError = Object.assign(new Error('Unauthorized'), {
        statusCode: 401,
      });
      mockGitApi.updatePullRequest.mock.mockImplementation(() =>
        Promise.reject(apiError),
      );

      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
          }),
        AzureDevOpsAuthenticationError,
      );
    });

    void it('should map 403 statusCode to AzureDevOpsPermissionError', async () => {
      const apiError = Object.assign(new Error('Forbidden'), {
        statusCode: 403,
      });
      mockGitApi.updatePullRequest.mock.mockImplementation(() =>
        Promise.reject(apiError),
      );

      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
          }),
        AzureDevOpsPermissionError,
      );
    });

    void it('should map 404 response.status to AzureDevOpsResourceNotFoundError', async () => {
      const apiError = Object.assign(new Error('Not Found'), {
        response: { status: 404 },
      });
      mockGitApi.getPullRequest.mock.mockImplementation(() =>
        Promise.reject(apiError),
      );

      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
          }),
        AzureDevOpsResourceNotFoundError,
      );
    });

    const validationStatusCodes = [400, 409] as const;

    for (const statusCode of validationStatusCodes) {
      void it(`should map ${statusCode} statusCode to AzureDevOpsValidationError`, async () => {
        const apiError = Object.assign(new Error('Policy rejected'), {
          statusCode,
        });
        mockGitApi.updatePullRequest.mock.mockImplementation(() =>
          Promise.reject(apiError),
        );

        await assert.rejects(
          () =>
            mergePullRequest(mockConnection, {
              projectId: 'my-project',
              repositoryId: 'explicit-repo-id',
              pullRequestId: 42,
            }),
          AzureDevOpsValidationError,
        );
      });
    }

    void it('should wrap unknown errors in AzureDevOpsError with cause', async () => {
      const rootCause = new Error('Socket hang up');
      mockGitApi.updatePullRequest.mock.mockImplementation(() =>
        Promise.reject(rootCause),
      );

      await assert.rejects(
        () =>
          mergePullRequest(mockConnection, {
            projectId: 'my-project',
            repositoryId: 'explicit-repo-id',
            pullRequestId: 42,
          }),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsError);
          assert.strictEqual(err.cause, rootCause);
          return true;
        },
      );
    });
  });
});

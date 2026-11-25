import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import type {
  GitPullRequest,
  IdentityRefWithVote,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import { VotePullRequestSchema } from '../schemas.ts';
import {
  getPullRequestVoteLabel,
  normalizePullRequestVote,
  votePullRequest,
} from './feature.ts';

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';

type GetPrByIdFn = (
  pullRequestId: number,
  project?: string,
) => Promise<GitPullRequest | undefined>;
type GetReviewerFn = (
  repositoryId: string,
  pullRequestId: number,
  reviewerId: string,
  project?: string,
) => Promise<IdentityRefWithVote | null | undefined>;
type CreateReviewerFn = (
  reviewer: IdentityRefWithVote,
  repositoryId: string,
  pullRequestId: number,
  reviewerId: string,
  project?: string,
) => Promise<IdentityRefWithVote>;
type ConnectFn = () => Promise<{
  authenticatedUser?: { id?: string; providerDisplayName?: string };
}>;
type RequestAdoFn = (opts: {
  method?: string;
  url: string;
  query?: Record<string, unknown>;
  context: string;
}) => Promise<{
  status: number;
  headers: Record<string, string>;
  data: unknown;
}>;

void describe('votePullRequest unit', () => {
  let mockGitApi: {
    getPullRequestById: Mock<GetPrByIdFn>;
    getPullRequestReviewer: Mock<GetReviewerFn>;
    createPullRequestReviewer: Mock<CreateReviewerFn>;
  };
  let mockConnect: Mock<ConnectFn>;
  let mockRequestAzureDevOps: Mock<RequestAdoFn>;
  let mockCtx: ToolContext;

  beforeEach(() => {
    mockGitApi = {
      getPullRequestById: mock.fn<GetPrByIdFn>(() =>
        Promise.resolve({
          pullRequestId: 42,
          status: PullRequestStatus.Active,
          repository: {
            id: 'derived-repo-id',
            name: 'DemoRepo',
            project: { id: 'derived-proj-id', name: 'DemoProject' },
          },
        }),
      ),
      getPullRequestReviewer: mock.fn<GetReviewerFn>(() =>
        Promise.resolve({
          id: ALICE_ID,
          displayName: 'Alice Developer',
          vote: 0,
          isRequired: true,
        }),
      ),
      createPullRequestReviewer: mock.fn<CreateReviewerFn>((body) =>
        Promise.resolve({
          id: body.id ?? ALICE_ID,
          displayName: 'Alice Developer',
          vote: body.vote,
          isRequired: body.isRequired,
          isReapprove: body.isReapprove,
          hasDeclined: body.hasDeclined,
        }),
      ),
    };

    mockConnect = mock.fn<ConnectFn>(() =>
      Promise.resolve({
        authenticatedUser: {
          id: ALICE_ID,
          providerDisplayName: 'Alice Developer',
        },
      }),
    );

    const mockConnection = {
      connect: mockConnect,
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    } as unknown as WebApi;

    mockRequestAzureDevOps = mock.fn<RequestAdoFn>(() =>
      Promise.resolve({
        status: 200,
        headers: {},
        data: {
          value: [
            {
              id: BOB_ID,
              providerDisplayName: 'Bob Reviewer',
              properties: { Mail: { $value: 'bob@example.com' } },
            },
          ],
        },
      }),
    );

    mockCtx = {
      config: {
        organizationUrl: 'https://dev.azure.com/contoso',
        authMethod: 'pat',
        apiVersion: '7.1',
        defaultProject: 'DemoProject',
        readOnly: false,
        spotlighting: true,
      },
      baseUrls: {
        type: 'services',
        organization: 'contoso',
        coreBaseUrl: 'https://dev.azure.com/contoso',
        identityBaseUrl: 'https://vssps.dev.azure.com/contoso',
        searchBaseUrl: 'https://almsearch.dev.azure.com/contoso',
        analyticsBaseUrl: 'https://analytics.dev.azure.com/contoso',
      },
      getWebApi: mock.fn(() => Promise.resolve(mockConnection)),
      requestAzureDevOps: mockRequestAzureDevOps,
      resolveOptionalProjectId: (explicit?: string) =>
        explicit ?? 'DemoProject',
      resolveProjectId: (explicit?: string) => explicit ?? 'DemoProject',
    } as unknown as ToolContext;
  });

  void describe('normalizePullRequestVote & getPullRequestVoteLabel', () => {
    void it('maps all valid numeric and friendly string votes', () => {
      assert.equal(normalizePullRequestVote(10), 10);
      assert.equal(normalizePullRequestVote(5), 5);
      assert.equal(normalizePullRequestVote(0), 0);
      assert.equal(normalizePullRequestVote(-5), -5);
      assert.equal(normalizePullRequestVote(-10), -10);

      assert.equal(normalizePullRequestVote('approved'), 10);
      assert.equal(normalizePullRequestVote('approvedWithSuggestions'), 5);
      assert.equal(normalizePullRequestVote('noVote'), 0);
      assert.equal(normalizePullRequestVote('waitingForAuthor'), -5);
      assert.equal(normalizePullRequestVote('rejected'), -10);

      assert.equal(getPullRequestVoteLabel(10), 'approved');
      assert.equal(getPullRequestVoteLabel(5), 'approvedWithSuggestions');
      assert.equal(getPullRequestVoteLabel(0), 'noVote');
      assert.equal(getPullRequestVoteLabel(-5), 'waitingForAuthor');
      assert.equal(getPullRequestVoteLabel(-10), 'rejected');
    });

    void it('rejects invalid numeric or string votes', () => {
      assert.throws(
        () => normalizePullRequestVote(7),
        AzureDevOpsValidationError,
      );
      assert.throws(
        () => normalizePullRequestVote(99),
        AzureDevOpsValidationError,
      );
      assert.throws(
        () => normalizePullRequestVote('lgtm'),
        AzureDevOpsValidationError,
      );
    });
  });

  void it('auto-derives repositoryId and self reviewerId and preserves isRequired: true', async () => {
    const result = await votePullRequest(mockCtx, {
      pullRequestId: 42,
      vote: 'approved',
    });

    assert.equal(result.vote, 10);
    assert.equal(result.voteLabel, 'approved');
    assert.equal(result.isRequired, true);
    assert.equal(result.repositoryId, 'derived-repo-id');
    assert.equal(mockGitApi.getPullRequestById.mock.callCount(), 1);
    assert.equal(mockConnect.mock.callCount(), 1);
    assert.equal(mockGitApi.getPullRequestReviewer.mock.callCount(), 1);
    assert.equal(mockGitApi.createPullRequestReviewer.mock.callCount(), 1);

    const [body, repoId, prId, reviewerId, proj] =
      mockGitApi.createPullRequestReviewer.mock.calls[0].arguments;
    assert.deepEqual(body, {
      id: ALICE_ID,
      vote: 10,
      isRequired: true,
    });
    assert.equal(repoId, 'derived-repo-id');
    assert.equal(prId, 42);
    assert.equal(reviewerId, ALICE_ID);
    assert.equal(proj, 'DemoProject');
  });

  void it('preserves existing isRequired: false without hardcoding true', async () => {
    mockGitApi.getPullRequestReviewer.mock.mockImplementationOnce(() =>
      Promise.resolve({
        id: ALICE_ID,
        vote: 0,
        isRequired: false,
      }),
    );

    const result = await votePullRequest(mockCtx, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      vote: 5,
    });

    assert.equal(result.vote, 5);
    assert.equal(result.voteLabel, 'approvedWithSuggestions');
    assert.equal(result.isRequired, false);
    assert.equal(mockGitApi.getPullRequestById.mock.callCount(), 0);
    assert.equal(mockGitApi.getPullRequestReviewer.mock.callCount(), 1);

    const [body] = mockGitApi.createPullRequestReviewer.mock.calls[0].arguments;
    assert.equal(body.isRequired, false);
    assert.equal(body.vote, 5);
  });

  void it('tolerates 404 or null from getPullRequestReviewer when caller is not yet a reviewer', async () => {
    mockGitApi.getPullRequestReviewer.mock.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error('Not found'), { statusCode: 404 }),
      ),
    );

    await votePullRequest(mockCtx, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      vote: 'waitingForAuthor',
    });

    const [body1] =
      mockGitApi.createPullRequestReviewer.mock.calls[0].arguments;
    assert.equal(body1.vote, -5);
    assert.equal(body1.isRequired, undefined);

    mockGitApi.getPullRequestReviewer.mock.mockImplementationOnce(() =>
      Promise.resolve(null),
    );

    await votePullRequest(mockCtx, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      vote: 'noVote',
    });

    const [body2] =
      mockGitApi.createPullRequestReviewer.mock.calls[1].arguments;
    assert.equal(body2.vote, 0);
    assert.equal(body2.isRequired, undefined);
  });

  void it('respects explicit isRequired override and optional flags without extra reviewer GET', async () => {
    await votePullRequest(mockCtx, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      vote: -10,
      isRequired: false,
      isReapprove: true,
      hasDeclined: false,
    });

    assert.equal(mockGitApi.getPullRequestReviewer.mock.callCount(), 0);
    const [body] = mockGitApi.createPullRequestReviewer.mock.calls[0].arguments;
    assert.deepEqual(body, {
      id: ALICE_ID,
      vote: -10,
      isRequired: false,
      isReapprove: true,
      hasDeclined: false,
    });
  });

  void it('resolves explicit email reviewerId via identity resolver', async () => {
    await votePullRequest(mockCtx, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      vote: 10,
      reviewerId: 'bob@example.com',
      isRequired: true,
    });

    assert.equal(mockConnect.mock.callCount(), 0);
    assert.equal(mockRequestAzureDevOps.mock.callCount(), 1);
    const [, , , reviewerId] =
      mockGitApi.createPullRequestReviewer.mock.calls[0].arguments;
    assert.equal(reviewerId, BOB_ID);
  });

  void it('rejects voting on completed or abandoned PR when repositoryId is omitted', async () => {
    mockGitApi.getPullRequestById.mock.mockImplementationOnce(() =>
      Promise.resolve({
        pullRequestId: 43,
        status: PullRequestStatus.Completed,
        repository: { id: 'DemoRepo' },
      }),
    );

    await assert.rejects(
      () =>
        votePullRequest(mockCtx, {
          pullRequestId: 43,
          vote: 10,
        }),
      (err: unknown) =>
        err instanceof AzureDevOpsValidationError &&
        /completed/i.test(err.message),
    );
    assert.equal(mockGitApi.createPullRequestReviewer.mock.callCount(), 0);
  });

  void it('maps HTTP 400, 401, 403, and 404 errors cleanly', async () => {
    mockGitApi.createPullRequestReviewer.mock.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(
          new Error('Cannot cast vote on a completed pull request.'),
          { statusCode: 400 },
        ),
      ),
    );
    await assert.rejects(
      () =>
        votePullRequest(mockCtx, {
          repositoryId: 'DemoRepo',
          pullRequestId: 43,
          vote: 10,
          isRequired: true,
        }),
      (err: unknown) =>
        err instanceof AzureDevOpsValidationError &&
        /completed/i.test(err.message),
    );

    mockGitApi.createPullRequestReviewer.mock.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
      ),
    );
    await assert.rejects(
      () =>
        votePullRequest(mockCtx, {
          repositoryId: 'DemoRepo',
          pullRequestId: 42,
          vote: 10,
          isRequired: true,
        }),
      AzureDevOpsAuthenticationError,
    );

    mockGitApi.createPullRequestReviewer.mock.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error('Forbidden'), { statusCode: 403 }),
      ),
    );
    await assert.rejects(
      () =>
        votePullRequest(mockCtx, {
          repositoryId: 'DemoRepo',
          pullRequestId: 42,
          vote: 10,
          isRequired: true,
        }),
      AzureDevOpsPermissionError,
    );

    mockGitApi.createPullRequestReviewer.mock.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error('Not found'), { statusCode: 404 }),
      ),
    );
    await assert.rejects(
      () =>
        votePullRequest(mockCtx, {
          repositoryId: 'DemoRepo',
          pullRequestId: 999,
          vote: 10,
          isRequired: true,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void it('validates VotePullRequestSchema inputs strictly', () => {
    assert.equal(
      VotePullRequestSchema.safeParse({ pullRequestId: 42, vote: 10 }).success,
      true,
    );
    assert.equal(
      VotePullRequestSchema.safeParse({ pullRequestId: 42, vote: 'rejected' })
        .success,
      true,
    );
    assert.equal(
      VotePullRequestSchema.safeParse({ pullRequestId: 42, vote: 7 }).success,
      false,
    );
    assert.equal(
      VotePullRequestSchema.safeParse({ pullRequestId: 0, vote: 10 }).success,
      false,
    );
  });
});

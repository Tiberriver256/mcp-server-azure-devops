import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import type {
  GitPullRequest,
  IdentityRefWithVote,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import { ManagePullRequestReviewersSchema } from '../schemas.ts';
import { managePullRequestReviewers } from './feature.ts';

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const CHARLIE_ID = '33333333-3333-4333-8333-333333333333';

type GetPrByIdFn = (
  pullRequestId: number,
  project?: string,
) => Promise<GitPullRequest | undefined>;
type GetReviewersFn = (
  repositoryId: string,
  pullRequestId: number,
  project?: string,
) => Promise<IdentityRefWithVote[]>;
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
type DeleteReviewerFn = (
  repositoryId: string,
  pullRequestId: number,
  reviewerId: string,
  project?: string,
) => Promise<void>;
type RestDelFn = (
  url: string,
  options?: Record<string, unknown>,
) => Promise<{ statusCode?: number; result: unknown }>;
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

void describe('managePullRequestReviewers unit', () => {
  let mockGitApi: {
    getPullRequestById: Mock<GetPrByIdFn>;
    getPullRequestReviewers: Mock<GetReviewersFn>;
    getPullRequestReviewer: Mock<GetReviewerFn>;
    createPullRequestReviewer: Mock<CreateReviewerFn>;
    deletePullRequestReviewer: Mock<DeleteReviewerFn>;
    vsoClient: {
      getVersioningData: Mock<
        (
          apiVersion: string,
          area: string,
          locationId: string,
          routeValues?: Record<string, unknown>,
        ) => Promise<{ requestUrl: string; apiVersion: string }>
      >;
    };
    createRequestOptions: Mock<
      (contentType: string, apiVersion: string) => Record<string, unknown>
    >;
    rest: {
      del: Mock<RestDelFn>;
    };
  };
  let mockRequestAzureDevOps: Mock<RequestAdoFn>;
  let mockCtx: ToolContext;

  beforeEach(() => {
    mockGitApi = {
      getPullRequestById: mock.fn<GetPrByIdFn>(() =>
        Promise.resolve({
          pullRequestId: 42,
          repository: {
            id: 'derived-repo',
            project: { id: 'derived-project' },
          },
        }),
      ),
      getPullRequestReviewers: mock.fn<GetReviewersFn>(() =>
        Promise.resolve([
          { id: ALICE_ID, displayName: 'Alice', isRequired: true, vote: 0 },
          { id: BOB_ID, displayName: 'Bob', isRequired: false, vote: 0 },
        ]),
      ),
      getPullRequestReviewer: mock.fn<GetReviewerFn>(() =>
        Promise.resolve({
          id: ALICE_ID,
          displayName: 'Alice',
          isRequired: true,
          vote: 10,
        }),
      ),
      createPullRequestReviewer: mock.fn<CreateReviewerFn>((body) =>
        Promise.resolve({
          id: body.id,
          isRequired: Boolean(body.isRequired),
          vote: 0,
        }),
      ),
      deletePullRequestReviewer: mock.fn<DeleteReviewerFn>(() =>
        Promise.resolve(),
      ),
      vsoClient: {
        getVersioningData: mock.fn(
          (
            _apiVersion: string,
            _area: string,
            _locationId: string,
            routeValues?: Record<string, unknown>,
          ) =>
            Promise.resolve({
              requestUrl: `https://dev.azure.com/contoso/${String(routeValues?.project ?? 'DemoProject')}/_apis/git/repositories/${String(routeValues?.repositoryId)}/pullRequests/${String(routeValues?.pullRequestId)}/reviewers/${String(routeValues?.reviewerId)}`,
              apiVersion: '7.1',
            }),
        ),
      },
      createRequestOptions: mock.fn(() => ({
        acceptHeader: 'application/json',
      })),
      rest: {
        del: mock.fn<RestDelFn>(() =>
          Promise.resolve({ statusCode: 204, result: null }),
        ),
      },
    };

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    } as unknown as WebApi;

    mockRequestAzureDevOps = mock.fn<RequestAdoFn>((opts) => {
      const filterValue = String(opts.query?.filterValue ?? '').toLowerCase();
      if (filterValue === 'charlie@example.com') {
        return Promise.resolve({
          status: 200,
          headers: {},
          data: {
            value: [
              {
                id: CHARLIE_ID,
                providerDisplayName: 'Charlie',
                properties: { Mail: { $value: 'charlie@example.com' } },
              },
            ],
          },
        });
      }
      if (filterValue === 'ambiguous@example.com') {
        return Promise.resolve({
          status: 200,
          headers: {},
          data: {
            value: [
              {
                id: '44444444-4444-4444-8444-444444444444',
                providerDisplayName: 'Ambig One',
                properties: { Mail: { $value: 'ambig1@example.com' } },
              },
              {
                id: '55555555-5555-4555-8555-555555555555',
                providerDisplayName: 'Ambig Two',
                properties: { Mail: { $value: 'ambig2@example.com' } },
              },
            ],
          },
        });
      }
      return Promise.resolve({
        status: 200,
        headers: {},
        data: { value: [] },
      });
    });

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

  void it('lists reviewers and auto-derives repositoryId when omitted', async () => {
    const res = await managePullRequestReviewers(mockCtx, {
      pullRequestId: 42,
      action: 'list',
    });

    assert.equal(res.action, 'list');
    assert.equal(res.repositoryId, 'derived-repo');
    assert.equal(res.count, 2);
    assert.equal(res.reviewers.length, 2);
    assert.equal(mockGitApi.getPullRequestById.mock.callCount(), 1);
    assert.equal(mockGitApi.getPullRequestReviewers.mock.callCount(), 1);
  });

  void it('adds reviewer by GUID without performing identity lookup', async () => {
    const res = await managePullRequestReviewers(mockCtx, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      action: 'add',
      reviewers: [{ id: CHARLIE_ID, isRequired: true }],
    });

    assert.equal(res.action, 'add');
    assert.equal(res.hasErrors, false);
    assert.equal(res.succeeded.length, 1);
    assert.equal(res.succeeded[0].id, CHARLIE_ID);
    assert.equal(mockRequestAzureDevOps.mock.callCount(), 0);

    const [body, repoId, prId, reviewerId] =
      mockGitApi.createPullRequestReviewer.mock.calls[0].arguments;
    assert.deepEqual(body, { id: CHARLIE_ID, isRequired: true });
    assert.equal(repoId, 'DemoRepo');
    assert.equal(prId, 42);
    assert.equal(reviewerId, CHARLIE_ID);
  });

  void it('resolves email reviewer via /_apis/identities and adds with isRequired', async () => {
    const res = await managePullRequestReviewers(mockCtx, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      action: 'add',
      reviewers: [{ reviewer: 'charlie@example.com', isRequired: true }],
    });

    assert.equal(res.action, 'add');
    assert.equal(res.hasErrors, false);
    assert.equal(res.succeeded[0].id, CHARLIE_ID);
    assert.equal(mockRequestAzureDevOps.mock.callCount(), 1);
    assert.equal(mockGitApi.createPullRequestReviewer.mock.callCount(), 1);
  });

  void it('rejects ambiguous identity with AzureDevOpsValidationError and zero mutations', async () => {
    await assert.rejects(
      () =>
        managePullRequestReviewers(mockCtx, {
          projectId: 'DemoProject',
          repositoryId: 'DemoRepo',
          pullRequestId: 42,
          action: 'add',
          reviewers: ['ambiguous@example.com'],
        }),
      (err: unknown) =>
        err instanceof AzureDevOpsValidationError &&
        /ambiguous/i.test(err.message),
    );
    assert.equal(mockGitApi.createPullRequestReviewer.mock.callCount(), 0);
  });

  void it('rejects unknown email with AzureDevOpsResourceNotFoundError and zero mutations', async () => {
    await assert.rejects(
      () =>
        managePullRequestReviewers(mockCtx, {
          projectId: 'DemoProject',
          repositoryId: 'DemoRepo',
          pullRequestId: 42,
          action: 'add',
          reviewers: ['nobody@example.com'],
        }),
      AzureDevOpsResourceNotFoundError,
    );
    assert.equal(mockGitApi.createPullRequestReviewer.mock.callCount(), 0);
  });

  void it('updates reviewer preserving existing isRequired when omitted', async () => {
    const res = await managePullRequestReviewers(mockCtx, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      action: 'update',
      reviewerId: ALICE_ID,
    });

    assert.equal(res.action, 'update');
    assert.equal(res.hasErrors, false);
    const [body] = mockGitApi.createPullRequestReviewer.mock.calls[0].arguments;
    assert.equal(body.isRequired, true);
  });

  void it('removes reviewer cleanly via strict REST delete', async () => {
    const res = await managePullRequestReviewers(mockCtx, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      action: 'remove',
      reviewers: [BOB_ID],
    });

    assert.equal(res.action, 'remove');
    assert.equal(res.hasErrors, false);
    assert.equal(res.succeeded.length, 1);
    assert.equal(res.succeeded[0].id, BOB_ID);
    assert.equal(mockGitApi.rest.del.mock.callCount(), 1);
  });

  void it('surfaces per-reviewer 404 partial failure on batch remove instead of swallowing 404', async () => {
    mockGitApi.rest.del.mock.mockImplementation((url: string) => {
      if (url.toLowerCase().includes(CHARLIE_ID)) {
        return Promise.resolve({ statusCode: 404, result: null });
      }
      return Promise.resolve({ statusCode: 204, result: null });
    });

    const res = await managePullRequestReviewers(mockCtx, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      action: 'remove',
      reviewers: [BOB_ID, CHARLIE_ID],
    });

    assert.equal(res.action, 'remove');
    assert.equal(res.hasErrors, true);
    assert.equal(res.succeeded.length, 1);
    assert.equal(res.succeeded[0].id, BOB_ID);
    assert.equal(res.failed.length, 1);
    assert.equal(res.failed[0].id, CHARLIE_ID);
    assert.match(res.failed[0].error ?? '', /404|not found/i);
  });

  void it('throws AzureDevOpsResourceNotFoundError when removing single missing reviewer', async () => {
    mockGitApi.rest.del.mock.mockImplementationOnce(() =>
      Promise.resolve({ statusCode: 404, result: null }),
    );

    await assert.rejects(
      () =>
        managePullRequestReviewers(mockCtx, {
          projectId: 'DemoProject',
          repositoryId: 'DemoRepo',
          pullRequestId: 42,
          action: 'remove',
          reviewerId: CHARLIE_ID,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void it('validates ManagePullRequestReviewersSchema requirements', () => {
    assert.equal(
      ManagePullRequestReviewersSchema.safeParse({
        pullRequestId: 42,
        action: 'list',
      }).success,
      true,
    );
    assert.equal(
      ManagePullRequestReviewersSchema.safeParse({
        pullRequestId: 42,
        action: 'add',
      }).success,
      false,
    );
    assert.equal(
      ManagePullRequestReviewersSchema.safeParse({
        pullRequestId: 42,
        action: 'add',
        reviewers: [{ isRequired: true }],
      }).success,
      false,
    );
    assert.equal(
      ManagePullRequestReviewersSchema.safeParse({
        pullRequestId: 42,
        action: 'add',
        reviewers: [CHARLIE_ID, { id: ALICE_ID, isRequired: true }],
      }).success,
      true,
    );
  });
});

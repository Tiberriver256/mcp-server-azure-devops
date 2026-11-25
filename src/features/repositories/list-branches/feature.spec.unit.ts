import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import type {
  GitBranchStats,
  GitRef,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { ListBranchesSchema } from '../schemas.ts';
import {
  isLegacyRefsApiVersion,
  listBranches,
  normalizeBranchFilter,
} from './feature.ts';

type GetVersioningDataFn = (
  apiVersion: string,
  area: string,
  locationId: string,
  routeValues?: Record<string, unknown>,
  queryParams?: Record<string, unknown>,
) => Promise<{ requestUrl: string; apiVersion: string }>;
type RestGetFn = (
  url: string,
  options?: Record<string, unknown>,
) => Promise<{
  statusCode?: number;
  result: { value?: GitRef[] } | GitRef[];
  headers?: Record<string, unknown>;
}>;
type GetBranchesFn = (
  repositoryId: string,
  project?: string,
) => Promise<GitBranchStats[]>;

void describe('listBranches unit', () => {
  const sampleRefs: GitRef[] = [
    {
      name: 'refs/heads/main',
      objectId: '1111111111111111111111111111111111111111',
      creator: { id: 'alice-id', displayName: 'Alice' },
      isLocked: false,
      statuses: [{ id: 1, description: 'CI passed' }],
    },
    {
      name: 'refs/heads/feature/analytics',
      objectId: '2222222222222222222222222222222222222222',
      creator: { id: 'alice-id', displayName: 'Alice' },
      isLocked: true,
    },
    {
      name: 'refs/tags/v0.1.0',
      objectId: '9999999999999999999999999999999999999999',
      isLocked: false,
    },
  ];

  let mockGitApi: {
    vsoClient: {
      getVersioningData: Mock<GetVersioningDataFn>;
    };
    createRequestOptions: Mock<
      (contentType: string, apiVersion: string) => Record<string, unknown>
    >;
    rest: {
      get: Mock<RestGetFn>;
    };
    getBranches: Mock<GetBranchesFn>;
    getRefs: Mock<(...args: unknown[]) => Promise<GitRef[]>>;
  };
  let mockConnection: WebApi;

  beforeEach(() => {
    mockGitApi = {
      vsoClient: {
        getVersioningData: mock.fn<GetVersioningDataFn>(
          (_apiVersion, _area, _locId, routeValues, queryParams) => {
            const url = new URL(
              `https://dev.azure.com/contoso/${String(routeValues?.project)}/_apis/git/repositories/${String(routeValues?.repositoryId)}/refs`,
            );
            for (const [k, v] of Object.entries(queryParams ?? {})) {
              if (v !== undefined) {
                url.searchParams.set(k, String(v));
              }
            }
            return Promise.resolve({
              requestUrl: url.toString(),
              apiVersion: '7.1',
            });
          },
        ),
      },
      createRequestOptions: mock.fn(() => ({
        acceptHeader: 'application/json',
      })),
      rest: {
        get: mock.fn<RestGetFn>(() =>
          Promise.resolve({
            statusCode: 200,
            result: { value: sampleRefs },
            headers: { 'x-ms-continuationtoken': '2' },
          }),
        ),
      },
      getBranches: mock.fn<GetBranchesFn>(() =>
        Promise.resolve([
          {
            name: 'main',
            aheadCount: 0,
            behindCount: 0,
            isBaseVersion: true,
            commit: { commitId: '1111111111111111111111111111111111111111' },
          },
          {
            name: 'feature/analytics',
            aheadCount: 3,
            behindCount: 1,
            isBaseVersion: false,
            commit: { commitId: '2222222222222222222222222222222222222222' },
          },
        ]),
      ),
      getRefs: mock.fn(() => Promise.resolve(sampleRefs)),
    };

    mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    } as unknown as WebApi;
  });

  void describe('helper functions', () => {
    void it('normalizes branch filters without double heads/ prefix', () => {
      assert.equal(normalizeBranchFilter(undefined), 'heads/');
      assert.equal(normalizeBranchFilter('   '), 'heads/');
      assert.equal(normalizeBranchFilter('feature/'), 'heads/feature/');
      assert.equal(normalizeBranchFilter('heads/feature/'), 'heads/feature/');
      assert.equal(
        normalizeBranchFilter('refs/heads/feature/'),
        'heads/feature/',
      );
      assert.equal(normalizeBranchFilter('heads/'), 'heads/');
      assert.equal(normalizeBranchFilter('refs/heads/'), 'heads/');
    });

    void it('detects legacy (< 6.0) refs API versions', () => {
      assert.equal(isLegacyRefsApiVersion('5.0'), true);
      assert.equal(isLegacyRefsApiVersion('5.1'), true);
      assert.equal(isLegacyRefsApiVersion('5.0-preview.1'), true);
      assert.equal(isLegacyRefsApiVersion('6.0'), false);
      assert.equal(isLegacyRefsApiVersion('7.1'), false);
      assert.equal(isLegacyRefsApiVersion('7.2-preview.2'), false);
      assert.equal(isLegacyRefsApiVersion(undefined), false);
    });
  });

  void it('lists heads-only branches with clean names, refName, $top, and continuationToken', async () => {
    const res = await listBranches(mockConnection, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      top: 2,
      continuationToken: '0',
    });

    assert.equal(res.count, 2);
    assert.equal(res.branches.length, 2);
    assert.equal(res.branches[0].name, 'main');
    assert.equal(res.branches[0].refName, 'refs/heads/main');
    assert.equal(res.branches[1].name, 'feature/analytics');
    assert.equal(res.branches[1].refName, 'refs/heads/feature/analytics');
    assert.equal(res.branches[1].isLocked, true);
    assert.equal(res.continuationToken, '2');

    const [url] = mockGitApi.rest.get.mock.calls[0].arguments;
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('filter'), 'heads/');
    assert.equal(parsed.searchParams.get('$top'), '2');
    assert.equal(parsed.searchParams.get('continuationToken'), '0');
  });

  void it('omits filter when includeMyBranches is true', async () => {
    mockGitApi.rest.get.mock.mockImplementationOnce(() =>
      Promise.resolve({
        statusCode: 200,
        result: { value: [sampleRefs[0]] },
        headers: {},
      }),
    );

    const res = await listBranches(mockConnection, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      includeMyBranches: true,
    });

    assert.equal(res.branches.length, 1);
    assert.equal(res.continuationToken, undefined);
    const [url] = mockGitApi.rest.get.mock.calls[0].arguments;
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('includeMyBranches'), 'true');
    assert.equal(parsed.searchParams.has('filter'), false);
  });

  void it('rejects combining filter and includeMyBranches: true with zero network calls', async () => {
    await assert.rejects(
      () =>
        listBranches(mockConnection, {
          projectId: 'DemoProject',
          repositoryId: 'DemoRepo',
          filter: 'heads/feature',
          includeMyBranches: true,
        }),
      AzureDevOpsValidationError,
    );
    assert.equal(mockGitApi.rest.get.mock.callCount(), 0);
  });

  void it('strips $top and continuationToken when negotiated api-version is 5.0 (Server 2019 RTM)', async () => {
    mockGitApi.vsoClient.getVersioningData.mock.mockImplementationOnce(
      (_apiVersion, _area, _locId, routeValues, queryParams) => {
        const url = new URL(
          `https://ado.corp/tfs/DefaultCollection/${String(routeValues?.project)}/_apis/git/repositories/${String(routeValues?.repositoryId)}/refs`,
        );
        for (const [k, v] of Object.entries(queryParams ?? {})) {
          if (v !== undefined) {
            url.searchParams.set(k, String(v));
          }
        }
        return Promise.resolve({
          requestUrl: url.toString(),
          apiVersion: '5.0',
        });
      },
    );

    await listBranches(mockConnection, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      top: 50,
      continuationToken: '10',
    });

    const [url] = mockGitApi.rest.get.mock.calls[0].arguments;
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.has('$top'), false);
    assert.equal(parsed.searchParams.has('continuationToken'), false);
    assert.equal(parsed.searchParams.get('filter'), 'heads/');
  });

  void it('enriches branches with aheadCount/behindCount/isBaseVersion/commit when includeStats is true', async () => {
    const res = await listBranches(mockConnection, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      includeStats: true,
    });

    assert.equal(mockGitApi.getBranches.mock.callCount(), 1);
    const main = res.branches.find((b) => b.name === 'main');
    const analytics = res.branches.find((b) => b.name === 'feature/analytics');
    assert.equal(main?.isBaseVersion, true);
    assert.equal(main?.aheadCount, 0);
    assert.equal(main?.behindCount, 0);
    assert.equal(analytics?.aheadCount, 3);
    assert.equal(analytics?.behindCount, 1);
    assert.equal(
      analytics?.commit?.commitId,
      '2222222222222222222222222222222222222222',
    );
  });

  void it('rejects invalid top values and latestStatusesOnly without includeStatuses', async () => {
    await assert.rejects(
      () =>
        listBranches(mockConnection, {
          projectId: 'DemoProject',
          repositoryId: 'DemoRepo',
          top: 1001,
        }),
      AzureDevOpsValidationError,
    );
    await assert.rejects(
      () =>
        listBranches(mockConnection, {
          projectId: 'DemoProject',
          repositoryId: 'DemoRepo',
          latestStatusesOnly: true,
        }),
      AzureDevOpsValidationError,
    );
    assert.equal(mockGitApi.rest.get.mock.callCount(), 0);
  });

  void it('falls back to gitApi.getRefs when vsoClient/rest are unavailable', async () => {
    const simpleConnection = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getRefs: mockGitApi.getRefs,
          getBranches: mockGitApi.getBranches,
        }),
      ),
    } as unknown as WebApi;

    const res = await listBranches(simpleConnection, {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      filter: 'feature/',
    });

    assert.equal(res.count, 2);
    assert.equal(mockGitApi.getRefs.mock.callCount(), 1);
    assert.equal(
      mockGitApi.getRefs.mock.calls[0].arguments[2],
      'heads/feature/',
    );
  });

  void it('maps HTTP 401, 403, and 404 responses cleanly', async () => {
    mockGitApi.rest.get.mock.mockImplementationOnce(() =>
      Promise.resolve({ statusCode: 404, result: { value: [] } }),
    );
    await assert.rejects(
      () =>
        listBranches(mockConnection, {
          projectId: 'DemoProject',
          repositoryId: 'MissingRepo',
        }),
      AzureDevOpsResourceNotFoundError,
    );

    mockGitApi.rest.get.mock.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
      ),
    );
    await assert.rejects(
      () =>
        listBranches(mockConnection, {
          projectId: 'DemoProject',
          repositoryId: 'DemoRepo',
        }),
      AzureDevOpsAuthenticationError,
    );

    mockGitApi.rest.get.mock.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error('Forbidden'), { statusCode: 403 }),
      ),
    );
    await assert.rejects(
      () =>
        listBranches(mockConnection, {
          projectId: 'DemoProject',
          repositoryId: 'DemoRepo',
        }),
      AzureDevOpsPermissionError,
    );
  });

  void it('validates ListBranchesSchema constraints', () => {
    assert.equal(
      ListBranchesSchema.safeParse({ repositoryId: 'DemoRepo', top: 100 })
        .success,
      true,
    );
    assert.equal(
      ListBranchesSchema.safeParse({ repositoryId: 'DemoRepo', top: 1001 })
        .success,
      false,
    );
    assert.equal(
      ListBranchesSchema.safeParse({
        repositoryId: 'DemoRepo',
        filter: 'feature/',
        includeMyBranches: true,
      }).success,
      false,
    );
    assert.equal(
      ListBranchesSchema.safeParse({
        repositoryId: 'DemoRepo',
        latestStatusesOnly: true,
      }).success,
      false,
    );
  });
});

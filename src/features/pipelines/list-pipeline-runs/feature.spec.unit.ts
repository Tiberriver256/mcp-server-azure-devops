import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import {
  RunResult,
  RunState,
} from 'azure-devops-node-api/interfaces/PipelinesInterfaces.js';
import { listPipelineRuns } from './feature.ts';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors/index.ts';
import type { Run } from '../types.ts';

type RestGetFn = (
  url: string,
  options?: unknown,
) => Promise<{
  statusCode: number;
  result: unknown;
  headers: Record<string, string>;
}>;

void describe('listPipelineRuns unit', () => {
  let mockConnection: WebApi;
  let mockGetPipelinesApi: Mock<() => Promise<unknown>>;
  let mockRestGet: Mock<RestGetFn>;

  const sampleRuns: Run[] = [
    {
      id: 101,
      name: 'Run 101',
      createdDate: new Date('2024-01-01T10:00:00Z'),
      state: RunState.Completed,
      result: RunResult.Succeeded,
      url: 'https://dev.azure.com/org/project/_apis/pipelines/42/runs/101',
      _links: {
        web: { href: 'https://dev.azure.com/org/project/pipelines/run/101' },
      },
    },
  ];

  beforeEach(() => {
    mockRestGet = mock.fn<RestGetFn>(() =>
      Promise.reject(new Error('Unexpected rest.get call')),
    );

    const mockPipelinesApi = {
      rest: { get: mockRestGet },
      createRequestOptions: mock.fn(() => ({
        acceptHeader: 'application/json',
      })),
      formatResponse: mock.fn((result: unknown) => {
        if (!result || typeof result !== 'object') {
          return [];
        }
        return (result as { value?: Run[] }).value ?? [];
      }),
    };

    mockGetPipelinesApi = mock.fn(() => Promise.resolve(mockPipelinesApi));

    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
      getPipelinesApi: mockGetPipelinesApi,
    } as unknown as WebApi;
  });

  void it('returns runs with continuation token from headers', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: { value: sampleRuns },
        headers: { 'x-ms-continuationtoken': 'token-from-header' },
      }),
    );

    const result = await listPipelineRuns(mockConnection, {
      projectId: 'test-project',
      pipelineId: 42,
    });

    assert.strictEqual(mockGetPipelinesApi.mock.callCount(), 1);
    assert.strictEqual(mockRestGet.mock.callCount(), 1);
    assert.deepStrictEqual(result.runs, sampleRuns);
    assert.strictEqual(result.continuationToken, 'token-from-header');

    const requestUrl = mockRestGet.mock.calls[0]?.arguments[0];
    assert.ok(requestUrl);
    const url = new URL(requestUrl);
    assert.strictEqual(url.searchParams.get('api-version'), '7.1');
    assert.strictEqual(url.searchParams.get('$top'), '50');
  });

  void it('applies filters, pagination, and branch normalization', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: { value: [], continuationToken: 'body-token' },
        headers: {},
      }),
    );

    const createdFrom = '2024-01-01T00:00:00Z';
    const createdTo = '2024-01-31T23:59:59Z';

    await listPipelineRuns(mockConnection, {
      projectId: 'test-project',
      pipelineId: 42,
      top: 20,
      continuationToken: 'next-token',
      branch: 'main',
      state: 'completed',
      result: 'succeeded',
      createdFrom,
      createdTo,
      orderBy: 'createdDate asc',
    });

    assert.strictEqual(mockRestGet.mock.callCount(), 1);
    const requestUrl = mockRestGet.mock.calls[0]?.arguments[0];
    assert.ok(requestUrl);
    const url = new URL(requestUrl);

    assert.strictEqual(url.searchParams.get('$top'), '20');
    assert.strictEqual(url.searchParams.get('continuationToken'), 'next-token');
    assert.strictEqual(url.searchParams.get('branch'), 'refs/heads/main');
    assert.strictEqual(url.searchParams.get('state'), 'completed');
    assert.strictEqual(url.searchParams.get('result'), 'succeeded');
    assert.strictEqual(url.searchParams.get('createdDate/min'), createdFrom);
    assert.strictEqual(url.searchParams.get('createdDate/max'), createdTo);
    assert.strictEqual(url.searchParams.get('orderBy'), 'createdDate asc');
  });

  void it('clamps top to 100 and preserves ref-prefixed branches', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: { value: [] },
        headers: {},
      }),
    );

    await listPipelineRuns(mockConnection, {
      projectId: 'test-project',
      pipelineId: 42,
      top: 150,
      branch: 'refs/heads/develop',
    });

    assert.strictEqual(mockRestGet.mock.callCount(), 1);
    const requestUrl = mockRestGet.mock.calls[0]?.arguments[0];
    assert.ok(requestUrl);
    const url = new URL(requestUrl);

    assert.strictEqual(url.searchParams.get('$top'), '100');
    assert.strictEqual(url.searchParams.get('branch'), 'refs/heads/develop');
  });

  void it('extracts continuation token from body when header missing', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: { value: [], continuationToken: 'body-token' },
        headers: {},
      }),
    );

    const result = await listPipelineRuns(mockConnection, {
      projectId: 'test-project',
      pipelineId: 42,
    });

    assert.strictEqual(result.continuationToken, 'body-token');
  });

  void it('throws resource not found when API returns 404', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 404,
        result: null,
        headers: {},
      }),
    );

    await assert.rejects(
      () =>
        listPipelineRuns(mockConnection, {
          projectId: 'test-project',
          pipelineId: 999,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void it('maps authentication errors', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.reject(new Error('401 Unauthorized')),
    );

    await assert.rejects(
      () =>
        listPipelineRuns(mockConnection, {
          projectId: 'test-project',
          pipelineId: 42,
        }),
      AzureDevOpsAuthenticationError,
    );
  });

  void it('wraps unexpected errors', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.reject(new Error('Boom')),
    );

    await assert.rejects(
      () =>
        listPipelineRuns(mockConnection, {
          projectId: 'test-project',
          pipelineId: 42,
        }),
      AzureDevOpsError,
    );
  });
});

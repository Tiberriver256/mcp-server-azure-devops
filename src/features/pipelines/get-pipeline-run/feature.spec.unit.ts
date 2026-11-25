import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import {
  RunResult,
  RunState,
} from 'azure-devops-node-api/interfaces/PipelinesInterfaces.js';
import { getPipelineRun } from './feature.ts';
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
type GetBuildFn = (projectId: string, runId: number) => Promise<unknown>;

void describe('getPipelineRun unit', () => {
  let mockConnection: WebApi;
  let mockRestGet: Mock<RestGetFn>;
  let mockGetBuild: Mock<GetBuildFn>;

  const baseRun: Run = {
    id: 200,
    name: 'Run 200',
    createdDate: new Date('2024-02-01T10:00:00Z'),
    state: RunState.Completed,
    result: RunResult.Succeeded,
    url: 'https://dev.azure.com/org/project/_apis/pipelines/runs/200',
    _links: {
      web: { href: 'https://dev.azure.com/org/project/pipelines/run/200' },
    },
    pipeline: { id: 42 },
  };

  beforeEach(() => {
    mockRestGet = mock.fn<RestGetFn>(() =>
      Promise.reject(new Error('Unexpected rest.get call')),
    );
    mockGetBuild = mock.fn<GetBuildFn>(() =>
      Promise.reject(new Error('not found')),
    );

    const mockPipelinesApi = {
      rest: { get: mockRestGet },
      createRequestOptions: mock.fn(() => ({
        acceptHeader: 'application/json',
      })),
      formatResponse: mock.fn((result: unknown) => result),
    };

    const mockBuildApi = {
      getBuild: mockGetBuild,
    };

    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
      getPipelinesApi: mock.fn(() => Promise.resolve(mockPipelinesApi)),
      getBuildApi: mock.fn(() => Promise.resolve(mockBuildApi)),
    } as unknown as WebApi;
  });

  void it('returns run details', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: baseRun,
        headers: {},
      }),
    );

    const run = await getPipelineRun(mockConnection, {
      projectId: 'test-project',
      runId: 200,
    });

    assert.deepStrictEqual(run, baseRun);
    assert.strictEqual(mockRestGet.mock.callCount(), 1);
    const requestUrl = mockRestGet.mock.calls[0]?.arguments[0];
    assert.ok(requestUrl);
    assert.ok(requestUrl.includes('/_apis/pipelines/runs/200'));
    assert.ok(requestUrl.includes('api-version=7.1'));
  });

  void it('uses build API to resolve pipeline id when not provided', async () => {
    mockGetBuild.mock.mockImplementation(() =>
      Promise.resolve({ definition: { id: 123 } }),
    );
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: baseRun,
        headers: {},
      }),
    );

    await getPipelineRun(mockConnection, {
      projectId: 'test-project',
      runId: 200,
    });

    assert.strictEqual(mockGetBuild.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetBuild.mock.calls[0]?.arguments, [
      'test-project',
      200,
    ]);
    assert.strictEqual(mockRestGet.mock.callCount(), 1);
    const requestUrl = mockRestGet.mock.calls[0]?.arguments[0];
    assert.ok(requestUrl);
    assert.ok(requestUrl.includes('/pipelines/123/runs/200'));
  });

  void it('validates pipeline membership when provided', async () => {
    mockRestGet.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          statusCode: 200,
          result: { ...baseRun, pipeline: { id: '42' } },
          headers: {},
        }),
      0,
    );

    const run = await getPipelineRun(mockConnection, {
      projectId: 'test-project',
      runId: 200,
      pipelineId: 42,
    });

    assert.strictEqual(run.pipeline?.id, '42');
  });

  void it('throws resource not found when pipeline guard fails', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: { ...baseRun, pipeline: { id: 99 } },
        headers: {},
      }),
    );

    await assert.rejects(
      () =>
        getPipelineRun(mockConnection, {
          projectId: 'test-project',
          runId: 200,
          pipelineId: 42,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void it('throws resource not found when pipeline information is missing but guard provided', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: { ...baseRun, pipeline: undefined },
        headers: {},
      }),
    );

    await assert.rejects(
      () =>
        getPipelineRun(mockConnection, {
          projectId: 'test-project',
          runId: 200,
          pipelineId: 42,
        }),
      AzureDevOpsResourceNotFoundError,
    );
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
        getPipelineRun(mockConnection, {
          projectId: 'test-project',
          runId: 404,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void it('falls back to generic run endpoint when pipeline-specific lookup fails', async () => {
    mockRestGet.mock.mockImplementationOnce(
      () => Promise.resolve({ statusCode: 404, result: null, headers: {} }),
      0,
    );
    mockRestGet.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          statusCode: 200,
          result: baseRun,
          headers: {},
        }),
      1,
    );

    const run = await getPipelineRun(mockConnection, {
      projectId: 'test-project',
      runId: 200,
      pipelineId: 42,
    });

    assert.deepStrictEqual(run, baseRun);
    assert.strictEqual(mockRestGet.mock.callCount(), 2);
    const firstUrl = mockRestGet.mock.calls[0]?.arguments[0];
    const secondUrl = mockRestGet.mock.calls[1]?.arguments[0];
    assert.ok(firstUrl);
    assert.ok(secondUrl);
    assert.ok(firstUrl.includes('/pipelines/42/runs/200'));
    assert.ok(secondUrl.includes('/pipelines/runs/200'));
  });

  void it('maps authentication errors', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.reject(new Error('Unauthorized 401')),
    );

    await assert.rejects(
      () =>
        getPipelineRun(mockConnection, {
          projectId: 'test-project',
          runId: 200,
        }),
      AzureDevOpsAuthenticationError,
    );
  });

  void it('wraps unexpected errors', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.reject(new Error('Something went wrong')),
    );

    await assert.rejects(
      () =>
        getPipelineRun(mockConnection, {
          projectId: 'test-project',
          runId: 200,
        }),
      AzureDevOpsError,
    );
  });
});

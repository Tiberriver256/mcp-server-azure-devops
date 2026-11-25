import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getPipelineTimeline } from './feature.ts';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors/index.ts';

type RestGetFn = (
  url: string,
  options?: unknown,
) => Promise<{
  statusCode: number;
  result: unknown;
  headers: Record<string, string>;
}>;

void describe('getPipelineTimeline unit', () => {
  let mockConnection: WebApi;
  let mockRestGet: Mock<RestGetFn>;

  beforeEach(() => {
    mockRestGet = mock.fn<RestGetFn>(() =>
      Promise.reject(new Error('Unexpected rest.get call')),
    );
    const mockBuildApi = {
      rest: { get: mockRestGet },
      createRequestOptions: mock.fn(() => ({
        acceptHeader: 'application/json',
      })),
    };

    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
      getBuildApi: mock.fn(() => Promise.resolve(mockBuildApi)),
    } as unknown as WebApi;
  });

  void it('retrieves the pipeline timeline with optional timeline id', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: {
          records: [
            { id: '1', state: 'completed', result: 'succeeded' },
            { id: '2', state: 'inProgress', result: 'none' },
          ],
        },
        headers: {},
      }),
    );

    const result = await getPipelineTimeline(mockConnection, {
      projectId: 'test-project',
      runId: 101,
      timelineId: 'timeline-1',
    });

    assert.deepStrictEqual(result, {
      records: [
        { id: '1', state: 'completed', result: 'succeeded' },
        { id: '2', state: 'inProgress', result: 'none' },
      ],
    });
    assert.strictEqual(mockRestGet.mock.callCount(), 1);
    const requestUrl = mockRestGet.mock.calls[0]?.arguments[0];
    assert.ok(requestUrl);
    const url = new URL(requestUrl);
    assert.ok(url.pathname.includes('/build/builds/101/timeline'));
    assert.strictEqual(url.searchParams.get('timelineId'), 'timeline-1');
    assert.strictEqual(url.searchParams.get('api-version'), '7.1');
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
        getPipelineTimeline(mockConnection, {
          projectId: 'test-project',
          runId: 101,
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
        getPipelineTimeline(mockConnection, {
          projectId: 'test-project',
          runId: 101,
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
        getPipelineTimeline(mockConnection, {
          projectId: 'test-project',
          runId: 101,
        }),
      AzureDevOpsError,
    );
  });

  void it('filters records by state and result when filters provided', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: {
          records: [
            { id: '1', state: 'completed', result: 'succeeded' },
            { id: '2', state: 'completed', result: 'failed' },
            { id: '3', state: 'inProgress', result: 'none' },
          ],
        },
        headers: {},
      }),
    );

    const result = await getPipelineTimeline(mockConnection, {
      projectId: 'test-project',
      runId: 101,
      state: ['completed'],
      result: 'succeeded',
    });

    assert.deepStrictEqual(result, {
      records: [{ id: '1', state: 'completed', result: 'succeeded' }],
    });
  });
});

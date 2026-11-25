import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getPipelineLog } from './feature.ts';
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
type CreateRequestOptionsFn = (
  acceptHeader: string,
  apiVersion: string,
) => { acceptHeader: string };
type GetBuildLogLinesFn = (
  projectId: string,
  runId: number,
  logId: number,
  startLine?: number,
  endLine?: number,
) => Promise<string[] | undefined>;

void describe('getPipelineLog unit', () => {
  let mockConnection: WebApi;
  let mockRestGet: Mock<RestGetFn>;
  let mockCreateRequestOptions: Mock<CreateRequestOptionsFn>;
  let mockGetBuildLogLines: Mock<GetBuildLogLinesFn>;

  beforeEach(() => {
    mockRestGet = mock.fn<RestGetFn>(() =>
      Promise.reject(new Error('Unexpected rest.get call')),
    );
    mockCreateRequestOptions = mock.fn<CreateRequestOptionsFn>(() => ({
      acceptHeader: 'application/json',
    }));
    mockGetBuildLogLines = mock.fn<GetBuildLogLinesFn>(() =>
      Promise.reject(new Error('Unexpected getBuildLogLines call')),
    );

    const mockBuildApi = {
      rest: { get: mockRestGet },
      createRequestOptions: mockCreateRequestOptions,
      getBuildLogLines: mockGetBuildLogLines,
    };

    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
      getBuildApi: mock.fn(() => Promise.resolve(mockBuildApi)),
    } as unknown as WebApi;
  });

  void it('retrieves the pipeline log with query parameters', async () => {
    mockRestGet.mock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: 'log content',
        headers: {},
      }),
    );

    const result = await getPipelineLog(mockConnection, {
      projectId: 'test-project',
      runId: 101,
      logId: 7,
      format: 'json',
      startLine: 10,
      endLine: 20,
    });

    assert.strictEqual(result, 'log content');
    assert.strictEqual(mockCreateRequestOptions.mock.callCount(), 1);
    assert.deepStrictEqual(mockCreateRequestOptions.mock.calls[0]?.arguments, [
      'application/json',
      '7.1',
    ]);
    assert.strictEqual(mockRestGet.mock.callCount(), 1);
    const requestUrl = mockRestGet.mock.calls[0]?.arguments[0];
    assert.ok(requestUrl);
    const url = new URL(requestUrl);
    assert.ok(url.pathname.includes('/build/builds/101/logs/7'));
    assert.strictEqual(url.searchParams.get('format'), 'json');
    assert.strictEqual(url.searchParams.get('startLine'), '10');
    assert.strictEqual(url.searchParams.get('endLine'), '20');
  });

  void it('defaults to plain text when format not provided', async () => {
    mockGetBuildLogLines.mock.mockImplementation(() =>
      Promise.resolve(['line1', 'line2']),
    );

    await getPipelineLog(mockConnection, {
      projectId: 'test-project',
      runId: 101,
      logId: 7,
    });

    assert.strictEqual(mockGetBuildLogLines.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetBuildLogLines.mock.calls[0]?.arguments, [
      'test-project',
      101,
      7,
      undefined,
      undefined,
    ]);
  });

  void it('throws resource not found when API returns 404', async () => {
    mockGetBuildLogLines.mock.mockImplementation(() =>
      Promise.resolve(undefined),
    );

    await assert.rejects(
      () =>
        getPipelineLog(mockConnection, {
          projectId: 'test-project',
          runId: 101,
          logId: 7,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void it('maps authentication errors', async () => {
    mockGetBuildLogLines.mock.mockImplementation(() =>
      Promise.reject(new Error('401 Unauthorized')),
    );

    await assert.rejects(
      () =>
        getPipelineLog(mockConnection, {
          projectId: 'test-project',
          runId: 101,
          logId: 7,
        }),
      AzureDevOpsAuthenticationError,
    );
  });

  void it('wraps unexpected errors', async () => {
    mockGetBuildLogLines.mock.mockImplementation(() =>
      Promise.reject(new Error('Boom')),
    );

    await assert.rejects(
      () =>
        getPipelineLog(mockConnection, {
          projectId: 'test-project',
          runId: 101,
          logId: 7,
        }),
      AzureDevOpsError,
    );
  });
});

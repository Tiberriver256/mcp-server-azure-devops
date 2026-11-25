import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import { Readable } from 'stream';
import type { WebApi } from 'azure-devops-node-api';
import type { BuildArtifact } from 'azure-devops-node-api/interfaces/BuildInterfaces.js';
import { downloadPipelineArtifact } from './feature.ts';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsRateLimitError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors/index.ts';
import { HttpError } from '../../../shared/http/http-client.ts';
import { buildTestZip } from '../../../shared/test/zip-builder.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';

type GetArtifactsFn = (
  projectId: string,
  runId: number,
) => Promise<BuildArtifact[]>;
type GetItemFn = (
  containerId: number,
  scope: string | undefined,
  itemPath: string,
) => Promise<{ statusCode: number; result?: NodeJS.ReadableStream }>;
type GetPipelinesApiFn = () => Promise<{
  getArtifact: Mock<(...args: unknown[]) => Promise<unknown>>;
}>;

void describe('downloadPipelineArtifact', () => {
  const projectId = 'GHQ_B2B_Delta';
  const runId = 13590799;

  let getArtifacts: Mock<GetArtifactsFn>;
  let getItem: Mock<GetItemFn>;
  let getBuildApi: Mock<() => Promise<{ getArtifacts: Mock<GetArtifactsFn> }>>;
  let getFileContainerApi: Mock<() => Promise<{ getItem: Mock<GetItemFn> }>>;
  let getPipelinesApi: Mock<GetPipelinesApiFn>;
  let connection: WebApi;

  const containerArtifact: BuildArtifact = {
    name: 'embedding-metrics',
    source: 'source',
    resource: {
      type: 'Container',
      data: '#/39106000/embedding-metrics',
      downloadUrl: 'https://example.com/container.zip',
    },
  };

  beforeEach(() => {
    getArtifacts = mock.fn<GetArtifactsFn>(() =>
      Promise.resolve([containerArtifact]),
    );
    getItem = mock.fn<GetItemFn>(() =>
      Promise.resolve({ statusCode: 404, result: undefined }),
    );
    getBuildApi = mock.fn(() => Promise.resolve({ getArtifacts }));
    getFileContainerApi = mock.fn(() => Promise.resolve({ getItem }));
    getPipelinesApi = mock.fn<GetPipelinesApiFn>(() =>
      Promise.reject(new Error('Unexpected getPipelinesApi call')),
    );
    connection = {
      serverUrl: 'https://dev.azure.com/test-org',
      getBuildApi,
      getFileContainerApi,
      getPipelinesApi,
    } as unknown as WebApi;
  });

  void it('downloads content from container artifacts using fallback paths', async () => {
    const streamContent = Readable.from(['{"status":"ok"}']);

    getItem.mock.mockImplementation((_containerId, _scope, itemPath) => {
      if (itemPath === 'embedding-metrics/embedding_metrics.json') {
        return Promise.resolve({ statusCode: 200, result: streamContent });
      }

      return Promise.resolve({ statusCode: 404, result: undefined });
    });

    const result = await downloadPipelineArtifact(connection, {
      projectId,
      runId,
      artifactPath: 'embedding-metrics/embedding_metrics.json',
    });

    assert.deepStrictEqual(result, {
      artifact: 'embedding-metrics',
      path: 'embedding-metrics/embedding_metrics.json',
      content: '{"status":"ok"}',
    });

    const attemptedPaths = new Set(
      getItem.mock.calls.map((call) => call.arguments[2]),
    );
    assert.ok(attemptedPaths.has('embedding_metrics.json'));
    assert.ok(attemptedPaths.has('embedding-metrics/embedding_metrics.json'));
  });

  void it('extracts matching file from PipelineArtifact ZIP via ToolContext.http', async () => {
    const pipelineArtifact: BuildArtifact = {
      name: 'reports',
      source: 'source',
      resource: {
        type: 'PipelineArtifact',
        downloadUrl: 'https://blobs.example.com/reports.zip',
      },
    };
    getArtifacts.mock.mockImplementation(() =>
      Promise.resolve([pipelineArtifact]),
    );

    const zipBuffer = buildTestZip([
      { name: 'reports/sub/output.json', content: '{"passed":42}' },
    ]);
    const arrayBuffer = zipBuffer.buffer.slice(
      zipBuffer.byteOffset,
      zipBuffer.byteOffset + zipBuffer.byteLength,
    );

    const httpGet = mock.fn(
      (_url: string, _options?: Record<string, unknown>) =>
        Promise.resolve({
          status: 200,
          headers: {},
          data: arrayBuffer,
        }),
    );
    getPipelinesApi.mock.mockImplementation(() =>
      Promise.resolve({
        getArtifact: mock.fn((..._args: unknown[]) =>
          Promise.resolve({
            signedContent: { url: 'https://blobs.example.com/reports.zip' },
          }),
        ),
      }),
    );

    const mockCtx = {
      http: { get: httpGet },
      getAuthHeader: mock.fn(() => Promise.resolve('Basic c2VjcmV0')),
      resolveProjectId: (p?: string) => p ?? projectId,
    } as unknown as ToolContext;

    const result = await downloadPipelineArtifact(
      connection,
      {
        projectId,
        pipelineId: 77,
        runId,
        artifactPath: 'reports/sub/output.json',
      },
      mockCtx,
    );

    assert.deepStrictEqual(result, {
      artifact: 'reports',
      path: 'reports/sub/output.json',
      content: '{"passed":42}',
    });
    assert.strictEqual(httpGet.mock.callCount(), 1);
    const callArgs = httpGet.mock.calls[0]?.arguments;
    assert.ok(callArgs);
    assert.strictEqual(callArgs.length, 2);
    assert.strictEqual(callArgs[0], 'https://blobs.example.com/reports.zip');
    assert.partialDeepStrictEqual(callArgs[1], { responseType: 'arraybuffer' });
  });

  void it('matches Windows backslash ZIP entry names inside PipelineArtifact archives', async () => {
    const pipelineArtifact: BuildArtifact = {
      name: 'reports',
      source: 'source',
      resource: {
        type: 'PipelineArtifact',
        downloadUrl: 'https://blobs.example.com/win-reports.zip',
      },
    };
    getArtifacts.mock.mockImplementation(() =>
      Promise.resolve([pipelineArtifact]),
    );

    const zipBuffer = buildTestZip([
      { name: 'reports\\sub\\output.json', content: '{"os":"windows"}' },
    ]);
    const arrayBuffer = zipBuffer.buffer.slice(
      zipBuffer.byteOffset,
      zipBuffer.byteOffset + zipBuffer.byteLength,
    );

    getPipelinesApi.mock.mockImplementation(() =>
      Promise.resolve({
        getArtifact: mock.fn((..._args: unknown[]) =>
          Promise.resolve({
            signedContent: { url: 'https://blobs.example.com/win-reports.zip' },
          }),
        ),
      }),
    );

    const mockCtx = {
      http: {
        get: mock.fn((_url: string, _options?: Record<string, unknown>) =>
          Promise.resolve({
            status: 200,
            headers: {},
            data: arrayBuffer,
          }),
        ),
      },
      getAuthHeader: mock.fn(() => Promise.resolve('Basic c2VjcmV0')),
      resolveProjectId: (p?: string) => p ?? projectId,
    } as unknown as ToolContext;

    const result = await downloadPipelineArtifact(
      connection,
      {
        projectId,
        pipelineId: 77,
        runId,
        artifactPath: 'reports/sub/output.json',
      },
      mockCtx,
    );

    assert.strictEqual(result.content, '{"os":"windows"}');
  });

  void it('maps HttpError statuses (203 auth redirect, 429 rate limit) to typed AzureDevOpsError subclasses', async () => {
    const pipelineArtifact: BuildArtifact = {
      name: 'reports',
      source: 'source',
      resource: {
        type: 'PipelineArtifact',
        downloadUrl:
          'https://dev.azure.com/test-org/_apis/artifacts/reports.zip',
      },
    };
    getArtifacts.mock.mockImplementation(() =>
      Promise.resolve([pipelineArtifact]),
    );
    getPipelinesApi.mock.mockImplementation(() =>
      Promise.resolve({
        getArtifact: mock.fn((..._args: unknown[]) =>
          Promise.resolve({
            signedContent: { url: 'https://blobs.example.com/reports.zip' },
          }),
        ),
      }),
    );

    const httpGet = mock.fn<
      (url: string, options?: Record<string, unknown>) => Promise<unknown>
    >(() => Promise.reject(new Error('Unexpected httpGet call')));
    httpGet.mock.mockImplementationOnce(
      () =>
        Promise.reject(
          new HttpError({
            message: 'HTTP 203 Non-Authoritative Information',
            status: 203,
            statusText: 'Non-Authoritative Information',
            url: 'https://blobs.example.com/reports.zip',
          }),
        ),
      0,
    );
    httpGet.mock.mockImplementationOnce(
      () =>
        Promise.reject(
          new HttpError({
            message: 'Too Many Requests',
            status: 429,
            statusText: 'Too Many Requests',
            url: 'https://blobs.example.com/reports.zip',
            headers: { 'retry-after': '15' },
          }),
        ),
      1,
    );

    const mockCtx = {
      http: { get: httpGet },
      getAuthHeader: mock.fn(() => Promise.resolve('Basic c2VjcmV0')),
      resolveProjectId: (p?: string) => p ?? projectId,
    } as unknown as ToolContext;

    await assert.rejects(
      () =>
        downloadPipelineArtifact(
          connection,
          {
            projectId,
            pipelineId: 77,
            runId,
            artifactPath: 'reports/sub/output.json',
          },
          mockCtx,
        ),
      AzureDevOpsAuthenticationError,
    );

    await assert.rejects(
      () =>
        downloadPipelineArtifact(
          connection,
          {
            projectId,
            pipelineId: 77,
            runId,
            artifactPath: 'reports/sub/output.json',
          },
          mockCtx,
        ),
      AzureDevOpsRateLimitError,
    );
  });

  void it('throws when the requested file is missing', async () => {
    getItem.mock.mockImplementation(() =>
      Promise.resolve({ statusCode: 404, result: undefined }),
    );

    await assert.rejects(
      () =>
        downloadPipelineArtifact(connection, {
          projectId,
          runId,
          artifactPath: 'embedding-metrics/missing.json',
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });
});

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import type { BuildArtifact } from 'azure-devops-node-api/interfaces/BuildInterfaces.js';
import type { FileContainerItem } from 'azure-devops-node-api/interfaces/FileContainerInterfaces.js';
import {
  ContainerItemStatus,
  ContainerItemType,
} from 'azure-devops-node-api/interfaces/FileContainerInterfaces.js';
import { fetchRunArtifacts, MAX_ARTIFACT_ZIP_BYTES } from './artifacts.ts';
import { buildTestZip } from '../../shared/test/zip-builder.ts';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';

void describe('fetchRunArtifacts', () => {
  const projectId = 'test-project';
  const runId = 123;

  let getBuildApi: Mock<() => Promise<unknown>>;
  let getFileContainerApi: Mock<() => Promise<unknown>>;
  let getPipelinesApi: Mock<() => Promise<unknown>>;
  let connection: WebApi;

  beforeEach(() => {
    getBuildApi = mock.fn<() => Promise<unknown>>(() =>
      Promise.resolve(undefined),
    );
    getFileContainerApi = mock.fn<() => Promise<unknown>>(() =>
      Promise.resolve(undefined),
    );
    getPipelinesApi = mock.fn<() => Promise<unknown>>(() =>
      Promise.resolve(undefined),
    );
    connection = {
      serverUrl: 'https://dev.azure.com/test-org',
      getBuildApi,
      getFileContainerApi,
      getPipelinesApi,
    } as unknown as WebApi;
  });

  void it('lists container artifact items with relative paths', async () => {
    const containerArtifact: BuildArtifact = {
      name: 'embedding-metrics',
      source: 'source-1',
      resource: {
        type: 'Container',
        data: '#/39106000/embedding-metrics',
        downloadUrl: 'https://dev.azure.com/test-org/artifact.zip',
        url: 'https://dev.azure.com/test-org/artifact',
      },
    };

    const items: FileContainerItem[] = [
      {
        containerId: 39106000,
        path: 'embedding-metrics',
        itemType: ContainerItemType.Folder,
        status: ContainerItemStatus.Created,
      },
      {
        containerId: 39106000,
        path: 'embedding-metrics/data',
        itemType: ContainerItemType.Folder,
        status: ContainerItemStatus.Created,
      },
      {
        containerId: 39106000,
        path: 'embedding-metrics/data/metrics.json',
        itemType: ContainerItemType.File,
        status: ContainerItemStatus.Created,
        fileLength: 2048,
      },
    ];

    getBuildApi.mock.mockImplementation(() =>
      Promise.resolve({
        getArtifacts: mock.fn(() => Promise.resolve([containerArtifact])),
      }),
    );

    getFileContainerApi.mock.mockImplementation(() =>
      Promise.resolve({
        getItems: mock.fn(() => Promise.resolve(items)),
      }),
    );

    const artifacts = await fetchRunArtifacts(connection, projectId, runId);

    assert.strictEqual(artifacts.length, 1);
    assert.deepStrictEqual(artifacts[0].items, [
      { path: 'data', itemType: 'folder', size: undefined },
      { path: 'data/metrics.json', itemType: 'file', size: 2048 },
    ]);
    assert.strictEqual(artifacts[0].itemsTruncated, undefined);
  });

  void it('lists pipeline artifact entries from zip content and sends auth only for same-origin URLs', async () => {
    const pipelineArtifact: BuildArtifact = {
      name: 'embedding-batch',
      source: 'source-2',
      resource: {
        type: 'PipelineArtifact',
        downloadUrl:
          'https://dev.azure.com/test-org/_apis/resources/pipeline-artifact.zip',
        url: 'https://dev.azure.com/test-org/_apis/resources/pipeline-artifact',
      },
    };

    const zipBuffer = buildTestZip([
      { name: 'embedding-batch/logs/summary.json', content: '{"ok":true}' },
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
    const getAuthHeader = mock.fn(() => Promise.resolve('Basic dGVzdA=='));
    const mockCtx = {
      http: { get: httpGet },
      getAuthHeader,
    } as unknown as ToolContext;

    getBuildApi.mock.mockImplementation(() =>
      Promise.resolve({
        getArtifacts: mock.fn(() => Promise.resolve([pipelineArtifact])),
      }),
    );

    getFileContainerApi.mock.mockImplementation(() =>
      Promise.resolve({
        getItems: mock.fn(() => Promise.resolve([])),
      }),
    );

    const artifacts = await fetchRunArtifacts(
      connection,
      projectId,
      runId,
      undefined,
      mockCtx,
    );

    assert.strictEqual(getAuthHeader.mock.callCount(), 1);
    assert.strictEqual(httpGet.mock.callCount(), 1);
    const callArgs = httpGet.mock.calls[0]?.arguments;
    assert.ok(callArgs);
    assert.strictEqual(callArgs.length, 2);
    assert.strictEqual(
      callArgs[0],
      'https://dev.azure.com/test-org/_apis/resources/pipeline-artifact.zip',
    );
    assert.ok(callArgs[1]);
    assert.deepStrictEqual(callArgs[1].headers, {
      Authorization: 'Basic dGVzdA==',
    });
    assert.strictEqual(callArgs[1].responseType, 'arraybuffer');
    assert.strictEqual(callArgs[1].maxResponseBytes, MAX_ARTIFACT_ZIP_BYTES);

    assert.strictEqual(artifacts.length, 1);
    assert.deepStrictEqual(artifacts[0].items, [
      { path: 'logs', itemType: 'folder' },
      { path: 'logs/summary.json', itemType: 'file', size: 11 },
    ]);
    assert.strictEqual(artifacts[0].itemsTruncated, undefined);
  });

  void it('omits Authorization header when downloading from external signed URLs', async () => {
    const pipelineArtifact: BuildArtifact = {
      name: 'drop',
      source: 'source-3',
      resource: {
        type: 'PipelineArtifact',
        downloadUrl: 'https://artprodcus3.artifacts.visualstudio.com/drop.zip',
      },
    };

    const zipBuffer = buildTestZip([{ name: 'drop/app.js', content: '1' }]);
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
    const getAuthHeader = mock.fn(() => Promise.resolve('Basic c2VjcmV0'));
    const mockCtx = {
      http: { get: httpGet },
      getAuthHeader,
    } as unknown as ToolContext;

    getBuildApi.mock.mockImplementation(() =>
      Promise.resolve({
        getArtifacts: mock.fn(() => Promise.resolve([pipelineArtifact])),
      }),
    );

    const artifacts = await fetchRunArtifacts(
      connection,
      projectId,
      runId,
      undefined,
      mockCtx,
    );

    assert.strictEqual(getAuthHeader.mock.callCount(), 0);
    assert.strictEqual(httpGet.mock.callCount(), 1);
    const callArgs = httpGet.mock.calls[0]?.arguments;
    assert.ok(callArgs);
    assert.strictEqual(callArgs.length, 2);
    assert.strictEqual(
      callArgs[0],
      'https://artprodcus3.artifacts.visualstudio.com/drop.zip',
    );
    assert.ok(callArgs[1]);
    assert.deepStrictEqual(callArgs[1].headers, {});
    assert.strictEqual(callArgs[1].responseType, 'arraybuffer');
    assert.strictEqual(callArgs[1].maxResponseBytes, MAX_ARTIFACT_ZIP_BYTES);
    assert.deepStrictEqual(artifacts[0].items, [
      { path: 'app.js', itemType: 'file', size: 1 },
    ]);
  });
});

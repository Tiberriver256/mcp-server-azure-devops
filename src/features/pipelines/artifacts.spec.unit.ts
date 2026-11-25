import type { WebApi } from 'azure-devops-node-api';
import type { BuildArtifact } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import type { FileContainerItem } from 'azure-devops-node-api/interfaces/FileContainerInterfaces';
import {
  ContainerItemStatus,
  ContainerItemType,
} from 'azure-devops-node-api/interfaces/FileContainerInterfaces';
import { fetchRunArtifacts, MAX_ARTIFACT_ZIP_BYTES } from './artifacts';
import { buildTestZip } from '../../shared/test/zip-builder';
import type { ToolContext } from '../../shared/session/azure-devops-session';

describe('fetchRunArtifacts', () => {
  const projectId = 'test-project';
  const runId = 123;

  const getBuildApi = jest.fn();
  const getFileContainerApi = jest.fn();
  const getPipelinesApi = jest.fn();

  const connection = {
    serverUrl: 'https://dev.azure.com/test-org',
    getBuildApi,
    getFileContainerApi,
    getPipelinesApi,
  } as unknown as WebApi;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('lists container artifact items with relative paths', async () => {
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

    getBuildApi.mockResolvedValue({
      getArtifacts: jest.fn().mockResolvedValue([containerArtifact]),
    });

    getFileContainerApi.mockResolvedValue({
      getItems: jest.fn().mockResolvedValue(items),
    });

    const artifacts = await fetchRunArtifacts(connection, projectId, runId);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].items).toEqual([
      { path: 'data', itemType: 'folder', size: undefined },
      { path: 'data/metrics.json', itemType: 'file', size: 2048 },
    ]);
    expect(artifacts[0].itemsTruncated).toBeUndefined();
  });

  it('lists pipeline artifact entries from zip content and sends auth only for same-origin URLs', async () => {
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

    const httpGet = jest.fn().mockResolvedValue({
      status: 200,
      headers: {},
      data: arrayBuffer,
    });
    const getAuthHeader = jest.fn().mockResolvedValue('Basic dGVzdA==');
    const mockCtx = {
      http: { get: httpGet },
      getAuthHeader,
    } as unknown as ToolContext;

    getBuildApi.mockResolvedValue({
      getArtifacts: jest.fn().mockResolvedValue([pipelineArtifact]),
    });

    getFileContainerApi.mockResolvedValue({
      getItems: jest.fn().mockResolvedValue([]),
    });

    const artifacts = await fetchRunArtifacts(
      connection,
      projectId,
      runId,
      undefined,
      mockCtx,
    );

    expect(getAuthHeader).toHaveBeenCalledTimes(1);
    expect(httpGet).toHaveBeenCalledWith(
      'https://dev.azure.com/test-org/_apis/resources/pipeline-artifact.zip',
      expect.objectContaining({
        headers: { Authorization: 'Basic dGVzdA==' },
        responseType: 'arraybuffer',
        maxResponseBytes: MAX_ARTIFACT_ZIP_BYTES,
      }),
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].items).toEqual([
      { path: 'logs', itemType: 'folder' },
      { path: 'logs/summary.json', itemType: 'file', size: 11 },
    ]);
    expect(artifacts[0].itemsTruncated).toBeUndefined();
  });

  it('omits Authorization header when downloading from external signed URLs', async () => {
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

    const httpGet = jest.fn().mockResolvedValue({
      status: 200,
      headers: {},
      data: arrayBuffer,
    });
    const getAuthHeader = jest.fn().mockResolvedValue('Basic c2VjcmV0');
    const mockCtx = {
      http: { get: httpGet },
      getAuthHeader,
    } as unknown as ToolContext;

    getBuildApi.mockResolvedValue({
      getArtifacts: jest.fn().mockResolvedValue([pipelineArtifact]),
    });

    const artifacts = await fetchRunArtifacts(
      connection,
      projectId,
      runId,
      undefined,
      mockCtx,
    );

    expect(getAuthHeader).not.toHaveBeenCalled();
    expect(httpGet).toHaveBeenCalledWith(
      'https://artprodcus3.artifacts.visualstudio.com/drop.zip',
      expect.objectContaining({
        headers: {},
        responseType: 'arraybuffer',
        maxResponseBytes: MAX_ARTIFACT_ZIP_BYTES,
      }),
    );
    expect(artifacts[0].items).toEqual([
      { path: 'app.js', itemType: 'file', size: 1 },
    ]);
  });
});

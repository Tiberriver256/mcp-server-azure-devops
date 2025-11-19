import axios from 'axios';
import JSZip from 'jszip';
import { WebApi } from 'azure-devops-node-api';
import { BuildArtifact } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {
  ContainerItemStatus,
  ContainerItemType,
  FileContainerItem,
} from 'azure-devops-node-api/interfaces/FileContainerInterfaces';
import { fetchRunArtifacts } from './artifacts';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('fetchRunArtifacts', () => {
  const projectId = 'test-project';
  const runId = 123;

  const getBuildApi = jest.fn();
  const getFileContainerApi = jest.fn();
  const getPipelinesApi = jest.fn();

  const connection = {
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
        downloadUrl: 'https://example.com/artifact.zip',
        url: 'https://example.com/artifact',
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

  it('lists pipeline artifact entries from zip content', async () => {
    const pipelineArtifact: BuildArtifact = {
      name: 'embedding-batch',
      source: 'source-2',
      resource: {
        type: 'PipelineArtifact',
        downloadUrl: 'https://example.com/pipeline-artifact.zip',
        url: 'https://example.com/pipeline-artifact',
      },
    };

    const zip = new JSZip();
    zip.file('embedding-batch/logs/summary.json', '{"ok":true}');
    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const arrayBuffer = zipBuffer.buffer.slice(
      zipBuffer.byteOffset,
      zipBuffer.byteOffset + zipBuffer.byteLength,
    );

    mockedAxios.get.mockResolvedValue({ data: arrayBuffer });

    getBuildApi.mockResolvedValue({
      getArtifacts: jest.fn().mockResolvedValue([pipelineArtifact]),
    });

    getFileContainerApi.mockResolvedValue({
      getItems: jest.fn().mockResolvedValue([]),
    });

    const artifacts = await fetchRunArtifacts(connection, projectId, runId);

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://example.com/pipeline-artifact.zip',
      expect.objectContaining({ responseType: 'arraybuffer' }),
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].items).toEqual([
      { path: 'logs', itemType: 'folder' },
      { path: 'logs/summary.json', itemType: 'file' },
    ]);
    expect(artifacts[0].itemsTruncated).toBeUndefined();
  });
});

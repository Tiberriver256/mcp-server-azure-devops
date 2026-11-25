import { Readable } from 'stream';
import type { WebApi } from 'azure-devops-node-api';
import type { BuildArtifact } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { downloadPipelineArtifact } from './feature';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors';
import { buildTestZip } from '../../../shared/test/zip-builder';
import type { ToolContext } from '../../../shared/session/azure-devops-session';

describe('downloadPipelineArtifact', () => {
  const projectId = 'GHQ_B2B_Delta';
  const runId = 13590799;

  const getArtifacts = jest.fn();
  const getItem = jest.fn();
  const getBuildApi = jest.fn().mockResolvedValue({ getArtifacts });
  const getFileContainerApi = jest.fn().mockResolvedValue({ getItem });
  const getPipelinesApi = jest.fn();

  const connection = {
    serverUrl: 'https://dev.azure.com/test-org',
    getBuildApi,
    getFileContainerApi,
    getPipelinesApi,
  } as unknown as WebApi;

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
    jest.resetAllMocks();
    getBuildApi.mockResolvedValue({ getArtifacts });
    getFileContainerApi.mockResolvedValue({ getItem });
    getArtifacts.mockResolvedValue([containerArtifact]);
  });

  it('downloads content from container artifacts using fallback paths', async () => {
    const streamContent = Readable.from(['{"status":"ok"}']);

    getItem.mockImplementation(
      async (
        _containerId: number,
        _scope: string | undefined,
        itemPath: string,
      ) => {
        if (itemPath === 'embedding-metrics/embedding_metrics.json') {
          return { statusCode: 200, result: streamContent };
        }

        return { statusCode: 404, result: undefined };
      },
    );

    const result = await downloadPipelineArtifact(connection, {
      projectId,
      runId,
      artifactPath: 'embedding-metrics/embedding_metrics.json',
    });

    expect(result).toEqual({
      artifact: 'embedding-metrics',
      path: 'embedding-metrics/embedding_metrics.json',
      content: '{"status":"ok"}',
    });

    const attemptedPaths = getItem.mock.calls.map(([, , path]) => path);
    expect(attemptedPaths).toContain('embedding_metrics.json');
    expect(attemptedPaths).toContain(
      'embedding-metrics/embedding_metrics.json',
    );
  });

  it('extracts matching file from PipelineArtifact ZIP via ToolContext.http', async () => {
    const pipelineArtifact: BuildArtifact = {
      name: 'reports',
      source: 'source',
      resource: {
        type: 'PipelineArtifact',
        downloadUrl: 'https://blobs.example.com/reports.zip',
      },
    };
    getArtifacts.mockResolvedValue([pipelineArtifact]);

    const zipBuffer = buildTestZip([
      { name: 'reports/sub/output.json', content: '{"passed":42}' },
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
    getPipelinesApi.mockResolvedValue({
      getArtifact: jest.fn().mockResolvedValue({
        signedContent: { url: 'https://blobs.example.com/reports.zip' },
      }),
    });

    const mockCtx = {
      http: { get: httpGet },
      getAuthHeader: jest.fn().mockResolvedValue('Basic c2VjcmV0'),
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

    expect(result).toEqual({
      artifact: 'reports',
      path: 'reports/sub/output.json',
      content: '{"passed":42}',
    });
    expect(httpGet).toHaveBeenCalledWith(
      'https://blobs.example.com/reports.zip',
      expect.objectContaining({ responseType: 'arraybuffer' }),
    );
  });

  it('throws when the requested file is missing', async () => {
    getItem.mockResolvedValue({ statusCode: 404, result: undefined });

    await expect(
      downloadPipelineArtifact(connection, {
        projectId,
        runId,
        artifactPath: 'embedding-metrics/missing.json',
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsResourceNotFoundError);
  });
});

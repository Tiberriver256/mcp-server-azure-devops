import { Readable } from 'stream';
import { WebApi } from 'azure-devops-node-api';
import { BuildArtifact } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { downloadPipelineArtifact } from './feature';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors';

describe('downloadPipelineArtifact', () => {
  const projectId = 'GHQ_B2B_Delta';
  const runId = 13590799;

  const getArtifacts = jest.fn();
  const getItem = jest.fn();
  const getBuildApi = jest.fn().mockResolvedValue({ getArtifacts });
  const getFileContainerApi = jest.fn().mockResolvedValue({ getItem });
  const getPipelinesApi = jest.fn();

  const connection = {
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

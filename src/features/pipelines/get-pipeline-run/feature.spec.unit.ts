import { getPipelineRun } from './feature';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

describe('getPipelineRun', () => {
  let mockConnection: any;
  let mockPipelinesApi: any;

  beforeEach(() => {
    mockPipelinesApi = {
      getRun: jest.fn(),
    };

    mockConnection = {
      getPipelinesApi: jest.fn().mockResolvedValue(mockPipelinesApi),
    };
  });

  it('should successfully get a pipeline run', async () => {
    const mockRun = {
      id: 123,
      name: 'Run 123',
      state: 'completed',
      result: 'succeeded',
      createdDate: '2024-01-01T00:00:00Z',
      finishedDate: '2024-01-01T01:00:00Z',
      pipeline: {
        id: 1,
        name: 'Test Pipeline',
      },
      templateParameters: {
        environment: 'staging',
      },
      variables: {
        BUILD_CONFIG: { value: 'Release' },
      },
    };

    mockPipelinesApi.getRun.mockResolvedValue(mockRun);

    const result = await getPipelineRun(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
      runId: 123,
    });

    expect(mockPipelinesApi.getRun).toHaveBeenCalledWith(
      'test-project',
      1,
      123,
    );
    expect(result).toEqual(mockRun);
  });

  it('should handle authentication errors', async () => {
    mockPipelinesApi.getRun.mockRejectedValue(new Error('401 Unauthorized'));

    await expect(
      getPipelineRun(mockConnection as any, {
        projectId: 'test-project',
        pipelineId: 1,
        runId: 123,
      }),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);
  });

  it('should handle not found errors', async () => {
    mockPipelinesApi.getRun.mockRejectedValue(new Error('Run does not exist'));

    await expect(
      getPipelineRun(mockConnection as any, {
        projectId: 'test-project',
        pipelineId: 1,
        runId: 999,
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  it('should handle generic errors', async () => {
    mockPipelinesApi.getRun.mockRejectedValue(new Error('Network error'));

    await expect(
      getPipelineRun(mockConnection as any, {
        projectId: 'test-project',
        pipelineId: 1,
        runId: 123,
      }),
    ).rejects.toThrow('Failed to get pipeline run: Network error');
  });
});

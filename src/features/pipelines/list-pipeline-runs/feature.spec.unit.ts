import { listPipelineRuns } from './feature';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

describe('listPipelineRuns', () => {
  let mockConnection: any;
  let mockPipelinesApi: any;

  beforeEach(() => {
    mockPipelinesApi = {
      listRuns: jest.fn(),
    };

    mockConnection = {
      getPipelinesApi: jest.fn().mockResolvedValue(mockPipelinesApi),
    };
  });

  it('should successfully list pipeline runs', async () => {
    const mockRuns = [
      {
        id: 123,
        name: 'Run 123',
        state: 'completed',
        result: 'succeeded',
        createdDate: '2024-01-01T00:00:00Z',
        finishedDate: '2024-01-01T01:00:00Z',
      },
      {
        id: 124,
        name: 'Run 124',
        state: 'inProgress',
        createdDate: '2024-01-02T00:00:00Z',
      },
    ];

    mockPipelinesApi.listRuns.mockResolvedValue(mockRuns);

    const result = await listPipelineRuns(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
    });

    expect(mockPipelinesApi.listRuns).toHaveBeenCalledWith('test-project', 1);
    expect(result).toEqual(mockRuns);
  });

  it('should return empty array when no runs exist', async () => {
    mockPipelinesApi.listRuns.mockResolvedValue(null);

    const result = await listPipelineRuns(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
    });

    expect(result).toEqual([]);
  });

  it('should handle authentication errors', async () => {
    mockPipelinesApi.listRuns.mockRejectedValue(new Error('401 Unauthorized'));

    await expect(
      listPipelineRuns(mockConnection as any, {
        projectId: 'test-project',
        pipelineId: 1,
      }),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);
  });

  it('should handle not found errors', async () => {
    mockPipelinesApi.listRuns.mockRejectedValue(
      new Error('Pipeline not found'),
    );

    await expect(
      listPipelineRuns(mockConnection as any, {
        projectId: 'test-project',
        pipelineId: 999,
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });
});

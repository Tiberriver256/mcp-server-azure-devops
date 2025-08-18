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

  it('should successfully list pipeline runs with default limit', async () => {
    const mockRuns = Array.from({ length: 100 }, (_, i) => ({
      id: 100 + i,
      name: `Run ${100 + i}`,
      state: 'completed',
      result: 'succeeded',
      createdDate: `2024-01-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`,
      finishedDate: `2024-01-${(i + 1).toString().padStart(2, '0')}T01:00:00Z`,
    }));

    mockPipelinesApi.listRuns.mockResolvedValue(mockRuns);

    const result = await listPipelineRuns(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
    });

    expect(mockPipelinesApi.listRuns).toHaveBeenCalledWith('test-project', 1);
    expect(result).toHaveLength(50); // Default limit
    expect(result[0]).toEqual(mockRuns[0]);
  });

  it('should respect custom top parameter', async () => {
    const mockRuns = Array.from({ length: 100 }, (_, i) => ({
      id: 100 + i,
      name: `Run ${100 + i}`,
      state: 'completed',
      result: 'succeeded',
    }));

    mockPipelinesApi.listRuns.mockResolvedValue(mockRuns);

    const result = await listPipelineRuns(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
      top: 10,
    });

    expect(result).toHaveLength(10);
    expect(result[0]).toEqual(mockRuns[0]);
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

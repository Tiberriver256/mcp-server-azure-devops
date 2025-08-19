import { getPipelineRunLogs } from './feature';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

describe('getPipelineRunLogs', () => {
  let mockConnection: any;
  let mockPipelinesApi: any;

  beforeEach(() => {
    mockPipelinesApi = {
      listLogs: jest.fn(),
      getLog: jest.fn(),
    };

    mockConnection = {
      getPipelinesApi: jest.fn().mockResolvedValue(mockPipelinesApi),
    };

    // Mock fetch for log content retrieval
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should successfully list all logs for a run', async () => {
    const mockLogs = {
      logs: [
        {
          id: 1,
          createdOn: '2024-01-01T00:00:00Z',
          lineCount: 100,
          url: 'https://example.com/log1',
        },
        {
          id: 2,
          createdOn: '2024-01-01T00:01:00Z',
          lineCount: 50,
          url: 'https://example.com/log2',
        },
        {
          id: 3,
          createdOn: '2024-01-01T00:02:00Z',
          lineCount: 75,
          url: 'https://example.com/log3',
        },
      ],
    };

    mockPipelinesApi.listLogs.mockResolvedValue(mockLogs);

    const result = await getPipelineRunLogs(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
      runId: 123,
    });

    expect(mockPipelinesApi.listLogs).toHaveBeenCalledWith(
      'test-project',
      1,
      123,
      1, // GetLogExpandOptions.SignedContent
    );
    expect(result.logs).toEqual(mockLogs);
    expect(result.content).toBeUndefined(); // No content fetch requested
  });

  it('should fetch log content when requested', async () => {
    const mockLogs = {
      logs: [
        { id: 1, url: 'https://example.com/log1' },
        { id: 2, url: 'https://example.com/log2' },
      ],
    };

    mockPipelinesApi.listLogs.mockResolvedValue(mockLogs);

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('Log content 1'),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('Log content 2'),
      });

    const result = await getPipelineRunLogs(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
      runId: 123,
      fetchContent: true,
    });

    expect(result.logs).toEqual(mockLogs);
    expect(result.content).toEqual(['Log content 1', 'Log content 2']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should get a specific log by ID', async () => {
    const mockLog = {
      id: 5,
      createdOn: '2024-01-01T00:00:00Z',
      lineCount: 150,
      url: 'https://example.com/log5',
    };

    mockPipelinesApi.getLog.mockResolvedValue(mockLog);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('Specific log content'),
    });

    const result = await getPipelineRunLogs(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
      runId: 123,
      logId: 5,
    });

    expect(mockPipelinesApi.getLog).toHaveBeenCalledWith(
      'test-project',
      1,
      123,
      5,
      1, // GetLogExpandOptions.SignedContent
    );
    expect(result.logs).toEqual({ logs: [mockLog] });
    expect(result.content).toEqual(['Specific log content']);
  });

  it('should handle logs without URLs gracefully', async () => {
    const mockLogs = {
      logs: [
        { id: 1, url: 'https://example.com/log1' },
        { id: 2 }, // No URL
      ],
    };

    mockPipelinesApi.listLogs.mockResolvedValue(mockLogs);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('Log content 1'),
    });

    const result = await getPipelineRunLogs(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
      runId: 123,
      fetchContent: true,
    });

    expect(result.content).toEqual(['Log content 1', '']);
    expect(global.fetch).toHaveBeenCalledTimes(1); // Only called for log with URL
  });

  it('should handle authentication errors', async () => {
    mockPipelinesApi.listLogs.mockRejectedValue(new Error('401 Unauthorized'));

    await expect(
      getPipelineRunLogs(mockConnection as any, {
        projectId: 'test-project',
        pipelineId: 1,
        runId: 123,
      }),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);
  });

  it('should handle not found errors', async () => {
    mockPipelinesApi.listLogs.mockRejectedValue(
      new Error('Pipeline run not found'),
    );

    await expect(
      getPipelineRunLogs(mockConnection as any, {
        projectId: 'test-project',
        pipelineId: 1,
        runId: 999,
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  it('should handle expand option of none', async () => {
    const mockLogs = {
      logs: [{ id: 1, lineCount: 100 }], // No URL when expand is none
    };

    mockPipelinesApi.listLogs.mockResolvedValue(mockLogs);

    const result = await getPipelineRunLogs(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
      runId: 123,
      expand: 'none',
    });

    expect(mockPipelinesApi.listLogs).toHaveBeenCalledWith(
      'test-project',
      1,
      123,
      0, // GetLogExpandOptions.None
    );
    expect(result.logs).toEqual(mockLogs);
  });

  it('should handle fetch errors gracefully', async () => {
    const mockLogs = {
      logs: [
        { id: 1, url: 'https://example.com/log1' },
        { id: 2, url: 'https://example.com/log2' },
      ],
    };

    mockPipelinesApi.listLogs.mockResolvedValue(mockLogs);

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('Log content 1'),
      })
      .mockRejectedValueOnce(new Error('Network error')); // Second fetch fails

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await getPipelineRunLogs(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
      runId: 123,
      fetchContent: true,
    });

    expect(result.content).toEqual(['Log content 1', '']); // Empty string for failed fetch
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to fetch content for log 2:',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it('should handle null response from listLogs', async () => {
    mockPipelinesApi.listLogs.mockResolvedValue(null);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await getPipelineRunLogs(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
      runId: 123,
      fetchContent: true,
    });

    expect(result.logs).toBeNull();
    expect(result.content).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      'No logs found for pipeline 1, run 123',
    );

    consoleSpy.mockRestore();
  });

  it('should handle null response from getLog', async () => {
    mockPipelinesApi.getLog.mockResolvedValue(null);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await getPipelineRunLogs(mockConnection as any, {
      projectId: 'test-project',
      pipelineId: 1,
      runId: 123,
      logId: 5,
    });

    expect(result.logs).toBeNull();
    expect(result.content).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Log 5 not found for pipeline 1, run 123',
    );

    consoleSpy.mockRestore();
  });
});

import { WebApi } from 'azure-devops-node-api';
import { IPipelinesApi } from 'azure-devops-node-api/PipelinesApi';
import * as fs from 'fs/promises';
import * as path from 'path';
import { downloadPipelineRunLogs } from './feature';
import * as PipelinesInterfaces from 'azure-devops-node-api/interfaces/PipelinesInterfaces';

// Mock fetch
global.fetch = jest.fn();

// Mock fs module
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  stat: jest.fn(),
}));

describe('downloadPipelineRunLogs', () => {
  let mockConnection: WebApi;
  let mockPipelinesApi: IPipelinesApi;

  beforeEach(() => {
    mockPipelinesApi = {
      listLogs: jest.fn(),
    } as unknown as IPipelinesApi;

    mockConnection = {
      getPipelinesApi: jest.fn().mockResolvedValue(mockPipelinesApi),
    } as unknown as WebApi;

    // Reset all mocks
    jest.clearAllMocks();
    (global.fetch as any).mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should download logs to the specified directory', async () => {
    const mockLogs = {
      logs: [
        {
          id: 1,
          lineCount: 100,
          signedContent: {
            url: 'https://example.com/log1',
          },
        },
        {
          id: 2,
          lineCount: 200,
          signedContent: {
            url: 'https://example.com/log2',
          },
        },
      ],
    };

    (mockPipelinesApi.listLogs as any).mockResolvedValue(mockLogs);

    // Mock fetch responses
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'Log 1 content',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'Log 2 content',
      });

    // Mock fs operations
    (fs.stat as any).mockResolvedValue({ size: 1024 });

    const result = await downloadPipelineRunLogs(mockConnection, {
      pipelineId: 83,
      runId: 12345,
      outputDir: '/tmp/logs',
    });

    // Verify API calls
    expect(mockPipelinesApi.listLogs).toHaveBeenCalledWith(
      'CCTV',
      83,
      12345,
      PipelinesInterfaces.GetLogExpandOptions.SignedContent,
    );

    // Verify directory creation
    expect(fs.mkdir).toHaveBeenCalledWith(
      '/tmp/logs/pipeline-83-run-12345-logs',
      { recursive: true },
    );

    // Verify files were written
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/tmp/logs/pipeline-83-run-12345-logs/log-001.txt',
      'Log 1 content',
      'utf-8',
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/tmp/logs/pipeline-83-run-12345-logs/log-002.txt',
      'Log 2 content',
      'utf-8',
    );

    // Verify summary file was written (third call)
    const summaryCall = (fs.writeFile as jest.Mock).mock.calls[2];
    expect(summaryCall[0]).toBe(
      '/tmp/logs/pipeline-83-run-12345-logs/summary.json',
    );
    expect(summaryCall[2]).toBe('utf-8');
    const summaryData = JSON.parse(summaryCall[1]);
    expect(summaryData.pipelineId).toBe(83);
    expect(summaryData.runId).toBe(12345);
    expect(summaryData.logsCount).toBe(2);
    expect(summaryData.totalSize).toBe(2048);

    // Verify result
    expect(result).toEqual({
      downloadPath: '/tmp/logs/pipeline-83-run-12345-logs',
      files: [
        {
          logId: 1,
          fileName: 'log-001.txt',
          lineCount: 100,
          size: 1024,
        },
        {
          logId: 2,
          fileName: 'log-002.txt',
          lineCount: 200,
          size: 1024,
        },
      ],
      totalSize: 2048,
    });
  });

  it('should use current directory when outputDir is not specified', async () => {
    const mockLogs = {
      logs: [
        {
          id: 1,
          lineCount: 50,
          url: 'https://example.com/log1', // Test fallback to url
        },
      ],
    };

    (mockPipelinesApi.listLogs as any).mockResolvedValue(mockLogs);
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => 'Log content',
    });
    (fs.stat as any).mockResolvedValue({ size: 512 });

    const cwd = process.cwd();
    await downloadPipelineRunLogs(mockConnection, {
      pipelineId: 83,
      runId: 12345,
    });

    expect(fs.mkdir).toHaveBeenCalledWith(
      path.join(cwd, 'pipeline-83-run-12345-logs'),
      { recursive: true },
    );
  });

  it('should handle logs without URLs', async () => {
    const mockLogs = {
      logs: [
        {
          id: 1,
          lineCount: 100,
          // No URL
        },
        {
          id: 2,
          lineCount: 200,
          signedContent: {
            url: 'https://example.com/log2',
          },
        },
      ],
    };

    (mockPipelinesApi.listLogs as any).mockResolvedValue(mockLogs);
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => 'Log 2 content',
    });
    (fs.stat as any).mockResolvedValue({ size: 1024 });

    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const result = await downloadPipelineRunLogs(mockConnection, {
      pipelineId: 83,
      runId: 12345,
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Log 1 has no URL available, skipping',
    );

    // Only log 2 should be downloaded
    expect(result.files).toHaveLength(1);
    expect(result.files[0].logId).toBe(2);

    consoleWarnSpy.mockRestore();
  });

  it('should handle failed downloads gracefully', async () => {
    const mockLogs = {
      logs: [
        {
          id: 1,
          lineCount: 100,
          signedContent: {
            url: 'https://example.com/log1',
          },
        },
        {
          id: 2,
          lineCount: 200,
          signedContent: {
            url: 'https://example.com/log2',
          },
        },
      ],
    };

    (mockPipelinesApi.listLogs as any).mockResolvedValue(mockLogs);

    // First fetch fails, second succeeds
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'Log 2 content',
      });

    (fs.stat as any).mockResolvedValue({ size: 1024 });

    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await downloadPipelineRunLogs(mockConnection, {
      pipelineId: 83,
      runId: 12345,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to download log 1: 401 Unauthorized',
    );

    // Only log 2 should be in results
    expect(result.files).toHaveLength(1);
    expect(result.files[0].logId).toBe(2);

    consoleErrorSpy.mockRestore();
  });

  it('should throw error when no logs are found', async () => {
    (mockPipelinesApi.listLogs as any).mockResolvedValue({
      logs: [],
    });

    await expect(
      downloadPipelineRunLogs(mockConnection, {
        pipelineId: 83,
        runId: 12345,
      }),
    ).rejects.toThrow('No logs found for pipeline 83, run 12345');
  });

  it('should handle fetch exceptions gracefully', async () => {
    const mockLogs = {
      logs: [
        {
          id: 1,
          lineCount: 100,
          signedContent: {
            url: 'https://example.com/log1',
          },
        },
      ],
    };

    (mockPipelinesApi.listLogs as any).mockResolvedValue(mockLogs);
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await downloadPipelineRunLogs(mockConnection, {
      pipelineId: 83,
      runId: 12345,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to download log 1:',
      expect.any(Error),
    );

    // No files should be downloaded
    expect(result.files).toHaveLength(0);
    expect(result.totalSize).toBe(0);

    consoleErrorSpy.mockRestore();
  });
});

import type { WebApi } from 'azure-devops-node-api';
import { triggerPipeline } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

// Unit tests should only focus on isolated logic
describe('triggerPipeline unit', () => {
  let mockConnection: WebApi;
  let mockPipelinesApi: any;

  beforeEach(() => {
    // Reset mocks
    jest.resetAllMocks();

    // Mock WebApi with a server URL
    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
    } as WebApi;

    // Mock the getPipelinesApi method
    mockPipelinesApi = {
      runPipeline: jest.fn(),
    };
    mockConnection.getPipelinesApi = jest
      .fn()
      .mockResolvedValue(mockPipelinesApi);
  });

  test('should trigger a pipeline with basic options', async () => {
    // Arrange
    const mockRun = { id: 123, name: 'Run 123' };
    mockPipelinesApi.runPipeline.mockResolvedValue(mockRun);

    // Act
    const result = await triggerPipeline(mockConnection, {
      projectId: 'testproject',
      pipelineId: 4,
      branch: 'main',
    });

    // Assert
    expect(mockConnection.getPipelinesApi).toHaveBeenCalled();
    expect(mockPipelinesApi.runPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: {
          repositories: {
            self: {
              refName: 'refs/heads/main',
            },
          },
        },
      }),
      'testproject',
      4,
    );
    expect(result).toBe(mockRun);
  });

  test('should trigger a pipeline with variables', async () => {
    // Arrange
    const mockRun = { id: 123, name: 'Run 123' };
    mockPipelinesApi.runPipeline.mockResolvedValue(mockRun);

    // Act
    const result = await triggerPipeline(mockConnection, {
      projectId: 'testproject',
      pipelineId: 4,
      variables: {
        var1: { value: 'value1' },
        var2: { value: 'value2', isSecret: true },
      },
    });

    // Assert
    expect(mockPipelinesApi.runPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          var1: { value: 'value1' },
          var2: { value: 'value2', isSecret: true },
        },
      }),
      'testproject',
      4,
    );
    expect(result).toBe(mockRun);
  });

  test('should handle authentication errors', async () => {
    // Arrange
    const authError = new Error('Authentication failed');
    mockPipelinesApi.runPipeline.mockRejectedValue(authError);

    // Act & Assert
    await expect(
      triggerPipeline(mockConnection, {
        projectId: 'testproject',
        pipelineId: 4,
      }),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(
      triggerPipeline(mockConnection, {
        projectId: 'testproject',
        pipelineId: 4,
      }),
    ).rejects.toThrow('Failed to authenticate');
  });

  test('should handle resource not found errors and null 404 responses', async () => {
    // Arrange
    const notFoundError = new Error('Pipeline not found');
    mockPipelinesApi.runPipeline.mockRejectedValue(notFoundError);

    // Act & Assert
    await expect(
      triggerPipeline(mockConnection, {
        projectId: 'testproject',
        pipelineId: 999,
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
    await expect(
      triggerPipeline(mockConnection, {
        projectId: 'testproject',
        pipelineId: 999,
      }),
    ).rejects.toThrow('Pipeline or project not found');

    // typed-rest-client resolves HTTP 404 to null instead of rejecting
    mockPipelinesApi.runPipeline.mockResolvedValue(null);
    await expect(
      triggerPipeline(mockConnection, {
        projectId: 'testproject',
        pipelineId: 999999,
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  test('does not double-prefix refs/heads/ branch values', async () => {
    const mockRun = { id: 124, name: 'Run 124' };
    mockPipelinesApi.runPipeline.mockResolvedValue(mockRun);

    await triggerPipeline(mockConnection, {
      projectId: 'testproject',
      pipelineId: 4,
      branch: 'refs/heads/release/1.0',
    });

    expect(mockPipelinesApi.runPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: {
          repositories: {
            self: {
              refName: 'refs/heads/release/1.0',
            },
          },
        },
      }),
      'testproject',
      4,
    );
  });

  test('should wrap other errors', async () => {
    // Arrange
    const testError = new Error('Some other error');
    mockPipelinesApi.runPipeline.mockRejectedValue(testError);

    // Act & Assert
    await expect(
      triggerPipeline(mockConnection, {
        projectId: 'testproject',
        pipelineId: 4,
      }),
    ).rejects.toThrow(AzureDevOpsError);
    await expect(
      triggerPipeline(mockConnection, {
        projectId: 'testproject',
        pipelineId: 4,
      }),
    ).rejects.toThrow('Failed to trigger pipeline');
  });
});

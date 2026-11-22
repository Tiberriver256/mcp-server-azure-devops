import type { WebApi } from 'azure-devops-node-api';
import { getPipeline } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

// Unit tests should only focus on isolated logic
describe('getPipeline unit', () => {
  let mockConnection: WebApi;
  let mockPipelinesApi: any;

  beforeEach(() => {
    // Reset mocks
    jest.resetAllMocks();

    // Setup mock Pipelines API
    mockPipelinesApi = {
      getPipeline: jest.fn(),
    };

    // Mock WebApi with a getPipelinesApi method
    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
      getPipelinesApi: jest.fn().mockResolvedValue(mockPipelinesApi),
    } as unknown as WebApi;
  });

  test('should return a pipeline', async () => {
    // Arrange
    const mockPipeline = {
      id: 1,
      name: 'Pipeline 1',
      folder: 'Folder 1',
      revision: 1,
      url: 'https://dev.azure.com/testorg/testproject/_apis/pipelines/1',
    };

    // Mock the Pipelines API to return data
    mockPipelinesApi.getPipeline.mockResolvedValue(mockPipeline);

    // Act
    const result = await getPipeline(mockConnection, {
      projectId: 'testproject',
      pipelineId: 1,
    });

    // Assert
    expect(mockConnection.getPipelinesApi).toHaveBeenCalled();
    expect(mockPipelinesApi.getPipeline).toHaveBeenCalledWith(
      'testproject',
      1,
      undefined,
    );
    expect(result).toEqual(mockPipeline);
  });

  test('should handle pipeline version parameter', async () => {
    // Arrange
    const mockPipeline = {
      id: 1,
      name: 'Pipeline 1',
      folder: 'Folder 1',
      revision: 2,
      url: 'https://dev.azure.com/testorg/testproject/_apis/pipelines/1',
    };

    mockPipelinesApi.getPipeline.mockResolvedValue(mockPipeline);

    // Act
    await getPipeline(mockConnection, {
      projectId: 'testproject',
      pipelineId: 1,
      pipelineVersion: 2,
    });

    // Assert
    expect(mockPipelinesApi.getPipeline).toHaveBeenCalledWith(
      'testproject',
      1,
      2,
    );
  });

  test('should handle authentication errors', async () => {
    // Arrange
    const authError = new Error('Authentication failed');
    authError.message = 'Authentication failed: Unauthorized';
    mockPipelinesApi.getPipeline.mockRejectedValue(authError);

    // Act & Assert
    await expect(
      getPipeline(mockConnection, { projectId: 'testproject', pipelineId: 1 }),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(
      getPipeline(mockConnection, { projectId: 'testproject', pipelineId: 1 }),
    ).rejects.toThrow(/Failed to authenticate/);
  });

  test('should handle resource not found errors', async () => {
    // Arrange
    const notFoundError = new Error('Not found');
    notFoundError.message = 'Pipeline does not exist';
    mockPipelinesApi.getPipeline.mockRejectedValue(notFoundError);

    // Act & Assert
    await expect(
      getPipeline(mockConnection, { projectId: 'testproject', pipelineId: 1 }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
    await expect(
      getPipeline(mockConnection, { projectId: 'testproject', pipelineId: 1 }),
    ).rejects.toThrow(/Pipeline or project not found/);
  });

  test('should wrap general errors in AzureDevOpsError', async () => {
    // Arrange
    const testError = new Error('Test API error');
    mockPipelinesApi.getPipeline.mockRejectedValue(testError);

    // Act & Assert
    await expect(
      getPipeline(mockConnection, { projectId: 'testproject', pipelineId: 1 }),
    ).rejects.toThrow(AzureDevOpsError);
    await expect(
      getPipeline(mockConnection, { projectId: 'testproject', pipelineId: 1 }),
    ).rejects.toThrow(/Failed to get pipeline/);
  });
});

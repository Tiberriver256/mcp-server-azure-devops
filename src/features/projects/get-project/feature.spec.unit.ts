import { getProject } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { ICoreApi } from 'azure-devops-node-api/CoreApi';
import { TeamProject } from 'azure-devops-node-api/interfaces/CoreInterfaces';

// Create a mock interface that only implements the methods we need
interface MockCoreApi extends Partial<ICoreApi> {
  getProject: jest.Mock<Promise<TeamProject | null>>;
}

// Create a connection type that matches only what we need for these tests
interface ConnectionLike {
  getCoreApi(): Promise<MockCoreApi>;
}

// Unit tests should only focus on isolated logic
describe('getProject unit', () => {
  test('should throw resource not found error when project is null', async () => {
    // Arrange
    const mockCoreApi: MockCoreApi = {
      getProject: jest.fn().mockResolvedValue(null), // Simulate project not found
    };

    const mockConnection: ConnectionLike = {
      getCoreApi: jest.fn().mockResolvedValue(mockCoreApi),
    };

    // Act & Assert
    await expect(
      getProject(
        mockConnection as unknown as ConnectionLike,
        'non-existent-project',
      ),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);

    await expect(
      getProject(
        mockConnection as unknown as ConnectionLike,
        'non-existent-project',
      ),
    ).rejects.toThrow("Project 'non-existent-project' not found");
  });

  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: ConnectionLike = {
      getCoreApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await expect(getProject(mockConnection, 'test-project')).rejects.toThrow(
      AzureDevOpsError,
    );

    await expect(getProject(mockConnection, 'test-project')).rejects.toThrow(
      'Custom error',
    );
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection: ConnectionLike = {
      getCoreApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    // Act & Assert
    await expect(getProject(mockConnection, 'test-project')).rejects.toThrow(
      'Failed to get project: Unexpected error',
    );
  });
});

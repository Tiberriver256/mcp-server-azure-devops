import { getProject } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { TeamProject } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { WebApi } from 'azure-devops-node-api';

// Create a partial mock interface for ICoreApi
interface MockCoreApi {
  getProject: jest.Mock<Promise<TeamProject | null>>;
}

// Create a mock connection that resembles WebApi with minimal implementation
interface MockConnection {
  getCoreApi: jest.Mock<Promise<MockCoreApi>>;
  serverUrl?: string;
  authHandler?: unknown;
  rest?: unknown;
  vsoClient?: unknown;
}

// Unit tests should only focus on isolated logic
describe('getProject unit', () => {
  test('should throw resource not found error when project is null', async () => {
    // Arrange
    const mockCoreApi: MockCoreApi = {
      getProject: jest.fn().mockResolvedValue(null), // Simulate project not found
    };

    const mockConnection: MockConnection = {
      getCoreApi: jest.fn().mockResolvedValue(mockCoreApi),
    };

    // Act & Assert
    await expect(
      getProject(mockConnection as unknown as WebApi, 'non-existent-project'),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);

    await expect(
      getProject(mockConnection as unknown as WebApi, 'non-existent-project'),
    ).rejects.toThrow("Project 'non-existent-project' not found");
  });

  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: MockConnection = {
      getCoreApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await expect(
      getProject(mockConnection as unknown as WebApi, 'test-project'),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      getProject(mockConnection as unknown as WebApi, 'test-project'),
    ).rejects.toThrow('Custom error');
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection: MockConnection = {
      getCoreApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    // Act & Assert
    await expect(
      getProject(mockConnection as unknown as WebApi, 'test-project'),
    ).rejects.toThrow('Failed to get project: Unexpected error');
  });
});

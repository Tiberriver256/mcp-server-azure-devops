import { getProject } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

// Unit tests should only focus on isolated logic
describe('getProject unit', () => {
  test('should throw resource not found error when project is null', async () => {
    // Arrange
    const mockConnection: any = {
      getCoreApi: jest.fn().mockImplementation(() => ({
        getProject: jest.fn().mockResolvedValue(null), // Simulate project not found
      })),
    };

    // Act & Assert
    await expect(
      getProject(mockConnection, 'non-existent-project'),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);

    await expect(
      getProject(mockConnection, 'non-existent-project'),
    ).rejects.toThrow("Project 'non-existent-project' not found");
  });

  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: any = {
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
    const mockConnection: any = {
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

import { getRepository } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('getRepository unit', () => {
  test('should propagate resource not found errors', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => ({
        getRepository: jest.fn().mockResolvedValue(null), // Simulate repository not found
      })),
    };

    // Act & Assert
    await expect(
      getRepository(mockConnection, 'test-project', 'non-existent-repo'),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);

    await expect(
      getRepository(mockConnection, 'test-project', 'non-existent-repo'),
    ).rejects.toThrow(
      "Repository 'non-existent-repo' not found in project 'test-project'",
    );
  });

  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await expect(
      getRepository(mockConnection, 'test-project', 'test-repo'),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      getRepository(mockConnection, 'test-project', 'test-repo'),
    ).rejects.toThrow('Custom error');
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    // Act & Assert
    await expect(
      getRepository(mockConnection, 'test-project', 'test-repo'),
    ).rejects.toThrow('Failed to get repository: Unexpected error');
  });
});

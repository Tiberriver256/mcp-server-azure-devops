import { getWorkItem } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('getWorkItem unit', () => {
  // Unit test for error handling logic - the only part that's suitable for a unit test
  test('should propagate custom errors when thrown internally', async () => {
    // Arrange - for unit test, we mock only what's needed
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(
      AzureDevOpsError,
    );
    await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(
      'Custom error',
    );
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    // Act & Assert
    await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(
      'Failed to get work item: Unexpected error',
    );
  });
});

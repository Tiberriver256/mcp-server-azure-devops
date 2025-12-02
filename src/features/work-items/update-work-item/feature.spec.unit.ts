import { updateWorkItem } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('updateWorkItem unit', () => {
  test('should throw error when no fields are provided for update', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    // Act & Assert - empty options object should throw
    await expect(
      updateWorkItem(
        mockConnection,
        123,
        {}, // No fields to update
      ),
    ).rejects.toThrow('At least one field must be provided for update');
  });

  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await expect(
      updateWorkItem(mockConnection, 123, { title: 'Updated Title' }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      updateWorkItem(mockConnection, 123, { title: 'Updated Title' }),
    ).rejects.toThrow('Custom error');
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    // Act & Assert
    await expect(
      updateWorkItem(mockConnection, 123, { title: 'Updated Title' }),
    ).rejects.toThrow('Failed to update work item: Unexpected error');
  });
});

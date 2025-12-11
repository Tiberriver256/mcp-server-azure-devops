import { deleteWorkItemAttachment } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('deleteWorkItemAttachment unit', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  // Test for required workItemId validation
  test('should throw error when workItemId is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      deleteWorkItemAttachment(mockConnection, {
        workItemId: 0, // Invalid work item ID
        attachmentId: 'abc-123',
      }),
    ).rejects.toThrow('Work item ID is required');
  });

  // Test for required attachmentId validation
  test('should throw error when attachmentId is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      deleteWorkItemAttachment(mockConnection, {
        workItemId: 123,
        attachmentId: '', // Empty attachment ID
      }),
    ).rejects.toThrow('Attachment ID is required');
  });

  // Test for error propagation
  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await expect(
      deleteWorkItemAttachment(mockConnection, {
        workItemId: 123,
        attachmentId: 'abc-123',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      deleteWorkItemAttachment(mockConnection, {
        workItemId: 123,
        attachmentId: 'abc-123',
      }),
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
      deleteWorkItemAttachment(mockConnection, {
        workItemId: 123,
        attachmentId: 'abc-123',
      }),
    ).rejects.toThrow('Failed to delete attachment: Unexpected error');
  });
});

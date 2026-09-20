import { getWorkItemAttachment } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('getWorkItemAttachment unit', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  // Test for required attachmentId validation
  test('should throw error when attachmentId is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: '', // Empty attachment ID
        outputPath: '/path/to/output.txt',
      }),
    ).rejects.toThrow('Attachment ID is required');
  });

  // Test for required outputPath validation
  test('should throw error when outputPath is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'abc-123',
        outputPath: '', // Empty output path
      }),
    ).rejects.toThrow('Output path is required');
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
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'abc-123',
        outputPath: '/path/to/output.txt',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'abc-123',
        outputPath: '/path/to/output.txt',
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
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'abc-123',
        outputPath: '/path/to/output.txt',
      }),
    ).rejects.toThrow('Failed to get attachment: Unexpected error');
  });
});

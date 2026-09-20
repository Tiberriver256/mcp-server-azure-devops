import { createWorkItemAttachment } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';
import * as fs from 'fs';

// Mock the fs module
jest.mock('fs');
const mockedFs = jest.mocked(fs);

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('createWorkItemAttachment unit', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  // Test for required filePath validation
  test('should throw error when filePath is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: '', // Empty file path
      }),
    ).rejects.toThrow('File path is required');
  });

  // Test for file existence validation
  test('should throw error when file does not exist', async () => {
    // Arrange - mock file does not exist
    mockedFs.existsSync.mockReturnValue(false);

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: '/path/to/nonexistent/file.txt',
      }),
    ).rejects.toThrow('File does not exist: /path/to/nonexistent/file.txt');
  });

  // Test for error propagation
  test('should propagate custom errors when thrown internally', async () => {
    // Arrange - mock file exists
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(Buffer.from('test content'));

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: '/path/to/file.txt',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: '/path/to/file.txt',
      }),
    ).rejects.toThrow('Custom error');
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange - mock file exists
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(Buffer.from('test content'));

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    // Act & Assert
    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: '/path/to/file.txt',
      }),
    ).rejects.toThrow('Failed to create attachment: Unexpected error');
  });
});

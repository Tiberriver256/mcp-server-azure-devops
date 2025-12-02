import { createWorkItem } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('createWorkItem unit', () => {
  // Test for required title validation
  test('should throw error when title is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      createWorkItem(
        mockConnection,
        'TestProject',
        'Task',
        { title: '' }, // Empty title
      ),
    ).rejects.toThrow('Title is required');
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
      createWorkItem(mockConnection, 'TestProject', 'Task', {
        title: 'Test Task',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      createWorkItem(mockConnection, 'TestProject', 'Task', {
        title: 'Test Task',
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
      createWorkItem(mockConnection, 'TestProject', 'Task', {
        title: 'Test Task',
      }),
    ).rejects.toThrow('Failed to create work item: Unexpected error');
  });

  test('should include severity field in work item creation', async () => {
    // Arrange
    const mockCreateWorkItem = jest.fn().mockResolvedValue({
      id: 123,
      fields: {
        'System.Title': 'Test Bug',
        'Microsoft.VSTS.Common.Severity': '1 - Critical',
      },
    });

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createWorkItem: mockCreateWorkItem,
      }),
      serverUrl: 'https://dev.azure.com/testorg',
    };

    // Act
    await createWorkItem(mockConnection, 'TestProject', 'Bug', {
      title: 'Test Bug',
      severity: '1 - Critical',
    });

    // Assert
    expect(mockCreateWorkItem).toHaveBeenCalled();
    const document = mockCreateWorkItem.mock.calls[0][1];
    const severityField = document.find(
      (op: { path: string }) =>
        op.path === '/fields/Microsoft.VSTS.Common.Severity',
    );
    expect(severityField).toBeDefined();
    expect(severityField.value).toBe('1 - Critical');
  });
});

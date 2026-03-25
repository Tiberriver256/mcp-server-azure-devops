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

  test('should include severity field in patch document when severity is provided', async () => {
    // Arrange
    const mockWorkItem = { id: 1, fields: { 'System.Title': 'Test Bug' } };
    const mockCreateWorkItem = jest.fn().mockResolvedValue(mockWorkItem);

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createWorkItem: mockCreateWorkItem,
      }),
    };

    // Act
    await createWorkItem(mockConnection, 'TestProject', 'Bug', {
      title: 'Test Bug',
      severity: '1 - Critical',
    });

    // Assert: the patch document sent to ADO must include the Severity field
    const patchDocument: Array<{ path: string; value: unknown }> =
      mockCreateWorkItem.mock.calls[0][1];
    const severityOp = patchDocument.find(
      (op) => op.path === '/fields/Microsoft.VSTS.Common.Severity',
    );
    expect(severityOp).toBeDefined();
    expect(severityOp?.value).toBe('1 - Critical');
  });

  test('should not include severity field in patch document when severity is omitted', async () => {
    // Arrange
    const mockWorkItem = { id: 1, fields: { 'System.Title': 'Test Task' } };
    const mockCreateWorkItem = jest.fn().mockResolvedValue(mockWorkItem);

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createWorkItem: mockCreateWorkItem,
      }),
    };

    // Act
    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Test Task',
    });

    // Assert: patch document must NOT contain a Severity entry
    const patchDocument: Array<{ path: string }> =
      mockCreateWorkItem.mock.calls[0][1];
    const severityOp = patchDocument.find(
      (op) => op.path === '/fields/Microsoft.VSTS.Common.Severity',
    );
    expect(severityOp).toBeUndefined();
  });
});

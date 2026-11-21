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

  test('should include System.Tags patch entry when tags option is provided', async () => {
    const mockCreateWorkItem = jest.fn().mockResolvedValue({ id: 1 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createWorkItem: mockCreateWorkItem,
      }),
    };

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Test Task',
      tags: ['bug', 'frontend'],
    });

    expect(mockCreateWorkItem).toHaveBeenCalledWith(
      null,
      expect.arrayContaining([
        {
          op: 'add',
          path: '/fields/System.Tags',
          value: 'bug; frontend',
        },
      ]),
      'TestProject',
      'Task',
    );
  });

  test('should not include System.Tags patch entry when tags option is empty', async () => {
    const mockCreateWorkItem = jest.fn().mockResolvedValue({ id: 1 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createWorkItem: mockCreateWorkItem,
      }),
    };

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Test Task',
      tags: [],
    });

    const document = mockCreateWorkItem.mock.calls[0][1];
    const tagsPatch = document.find(
      (entry: any) => entry.path === '/fields/System.Tags',
    );
    expect(tagsPatch).toBeUndefined();
  });

  test('should include multilineFieldsFormat patch entry when descriptionFormat is markdown', async () => {
    const mockCreateWorkItem = jest.fn().mockResolvedValue({ id: 1 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createWorkItem: mockCreateWorkItem,
      }),
    };

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Markdown Task',
      description: '## Heading\n- item 1',
      descriptionFormat: 'markdown',
    });

    expect(mockCreateWorkItem).toHaveBeenCalledWith(
      null,
      expect.arrayContaining([
        {
          op: 'add',
          path: '/fields/System.Description',
          value: '## Heading\n- item 1',
        },
        {
          op: 'add',
          path: '/multilineFieldsFormat/System.Description',
          value: 'Markdown',
        },
      ]),
      'TestProject',
      'Task',
    );
  });

  test('should not include multilineFieldsFormat patch entry when descriptionFormat is omitted or html', async () => {
    const mockCreateWorkItem = jest.fn().mockResolvedValue({ id: 1 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createWorkItem: mockCreateWorkItem,
      }),
    };

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Default HTML Task',
      description: '<p>Hello</p>',
    });

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Explicit HTML Task',
      description: '<p>Hello</p>',
      descriptionFormat: 'html',
    });

    for (const call of mockCreateWorkItem.mock.calls) {
      const document = call[1];
      const formatPatch = document.find(
        (entry: any) =>
          entry.path === '/multilineFieldsFormat/System.Description',
      );
      expect(formatPatch).toBeUndefined();
    }
  });
});

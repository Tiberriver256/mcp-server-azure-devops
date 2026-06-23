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

  test('should overwrite tags using replace when existing tags are present', async () => {
    const mockGetWorkItem = jest.fn().mockResolvedValue({
      id: 123,
      fields: { 'System.Tags': 'old1; old2' },
    });
    const mockUpdateWorkItem = jest.fn().mockResolvedValue({ id: 123 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getWorkItem: mockGetWorkItem,
        updateWorkItem: mockUpdateWorkItem,
      }),
    };

    await updateWorkItem(mockConnection, 123, {
      tags: ['tag1', 'tag2'],
    });

    expect(mockGetWorkItem).toHaveBeenCalledWith(123, ['System.Tags']);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      {},
      [
        {
          op: 'replace',
          path: '/fields/System.Tags',
          value: 'tag1; tag2',
        },
      ],
      123,
      undefined,
      false,
      false,
      false,
      expect.any(Number),
    );
  });

  test('should overwrite tags using add when no existing tags', async () => {
    const mockGetWorkItem = jest.fn().mockResolvedValue({
      id: 123,
      fields: {},
    });
    const mockUpdateWorkItem = jest.fn().mockResolvedValue({ id: 123 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getWorkItem: mockGetWorkItem,
        updateWorkItem: mockUpdateWorkItem,
      }),
    };

    await updateWorkItem(mockConnection, 123, {
      tags: ['tag1', 'tag2'],
    });

    expect(mockGetWorkItem).toHaveBeenCalledWith(123, ['System.Tags']);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      {},
      [
        {
          op: 'add',
          path: '/fields/System.Tags',
          value: 'tag1; tag2',
        },
      ],
      123,
      undefined,
      false,
      false,
      false,
      expect.any(Number),
    );
  });

  test('should clear tags using replace when existing tags are present', async () => {
    const mockGetWorkItem = jest.fn().mockResolvedValue({
      id: 123,
      fields: { 'System.Tags': 'old1; old2' },
    });
    const mockUpdateWorkItem = jest.fn().mockResolvedValue({ id: 123 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getWorkItem: mockGetWorkItem,
        updateWorkItem: mockUpdateWorkItem,
      }),
    };

    await updateWorkItem(mockConnection, 123, {
      tags: [],
    });

    expect(mockGetWorkItem).toHaveBeenCalledWith(123, ['System.Tags']);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      {},
      [
        {
          op: 'replace',
          path: '/fields/System.Tags',
          value: '',
        },
      ],
      123,
      undefined,
      false,
      false,
      false,
      expect.any(Number),
    );
  });

  test('should clear tags using add when no existing tags', async () => {
    const mockGetWorkItem = jest.fn().mockResolvedValue({
      id: 123,
      fields: {},
    });
    const mockUpdateWorkItem = jest.fn().mockResolvedValue({ id: 123 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getWorkItem: mockGetWorkItem,
        updateWorkItem: mockUpdateWorkItem,
      }),
    };

    await updateWorkItem(mockConnection, 123, {
      tags: [],
    });

    expect(mockGetWorkItem).toHaveBeenCalledWith(123, ['System.Tags']);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      {},
      [
        {
          op: 'add',
          path: '/fields/System.Tags',
          value: '',
        },
      ],
      123,
      undefined,
      false,
      false,
      false,
      expect.any(Number),
    );
  });

  test('should fetch and add tags when tagsToAdd is provided', async () => {
    const mockGetWorkItem = jest.fn().mockResolvedValue({
      id: 123,
      fields: {
        'System.Tags': 'existing1; existing2',
      },
    });
    const mockUpdateWorkItem = jest.fn().mockResolvedValue({ id: 123 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getWorkItem: mockGetWorkItem,
        updateWorkItem: mockUpdateWorkItem,
      }),
    };

    await updateWorkItem(mockConnection, 123, {
      tagsToAdd: ['existing2', 'newTag'],
    });

    expect(mockGetWorkItem).toHaveBeenCalledWith(123, ['System.Tags']);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      {},
      [
        {
          op: 'replace',
          path: '/fields/System.Tags',
          value: 'existing1; existing2; newTag',
        },
      ],
      123,
      undefined,
      false,
      false,
      false,
      expect.any(Number),
    );
  });

  test('should fetch and remove tags when tagsToRemove is provided', async () => {
    const mockGetWorkItem = jest.fn().mockResolvedValue({
      id: 123,
      fields: {
        'System.Tags': 'existing1; existing2; existing3',
      },
    });
    const mockUpdateWorkItem = jest.fn().mockResolvedValue({ id: 123 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getWorkItem: mockGetWorkItem,
        updateWorkItem: mockUpdateWorkItem,
      }),
    };

    await updateWorkItem(mockConnection, 123, {
      tagsToRemove: ['existing2', 'nonExistent'],
    });

    expect(mockGetWorkItem).toHaveBeenCalledWith(123, ['System.Tags']);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      {},
      [
        {
          op: 'replace',
          path: '/fields/System.Tags',
          value: 'existing1; existing3',
        },
      ],
      123,
      undefined,
      false,
      false,
      false,
      expect.any(Number),
    );
  });

  test('should remove tags case-insensitively', async () => {
    const mockGetWorkItem = jest.fn().mockResolvedValue({
      id: 123,
      fields: {
        'System.Tags': 'Bug; Feature; Enhancement',
      },
    });
    const mockUpdateWorkItem = jest.fn().mockResolvedValue({ id: 123 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getWorkItem: mockGetWorkItem,
        updateWorkItem: mockUpdateWorkItem,
      }),
    };

    await updateWorkItem(mockConnection, 123, {
      tagsToRemove: ['bug', 'FEATURE'],
    });

    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      {},
      [
        {
          op: 'replace',
          path: '/fields/System.Tags',
          value: 'Enhancement',
        },
      ],
      123,
      undefined,
      false,
      false,
      false,
      expect.any(Number),
    );
  });

  test('should not add duplicate tags case-insensitively', async () => {
    const mockGetWorkItem = jest.fn().mockResolvedValue({
      id: 123,
      fields: {
        'System.Tags': 'Bug; Feature',
      },
    });
    const mockUpdateWorkItem = jest.fn().mockResolvedValue({ id: 123 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getWorkItem: mockGetWorkItem,
        updateWorkItem: mockUpdateWorkItem,
      }),
    };

    await updateWorkItem(mockConnection, 123, {
      tagsToAdd: ['bug', 'NewTag'],
    });

    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      {},
      [
        {
          op: 'replace',
          path: '/fields/System.Tags',
          value: 'Bug; Feature; NewTag',
        },
      ],
      123,
      undefined,
      false,
      false,
      false,
      expect.any(Number),
    );
  });
});

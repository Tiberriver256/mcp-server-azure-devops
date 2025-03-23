import { listWorkItems } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

// Unit tests should only focus on isolated logic
describe('listWorkItems unit', () => {
  test('should return empty array when no work items are found', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => ({
        queryByWiql: jest.fn().mockResolvedValue({
          workItems: [], // No work items returned
        }),
        getWorkItems: jest.fn().mockResolvedValue([]),
      })),
    };

    // Act
    const result = await listWorkItems(mockConnection, {
      projectId: 'test-project',
    });

    // Assert
    expect(result).toEqual([]);
  });

  test('should properly handle pagination options', async () => {
    // Arrange
    const mockWorkItemRefs = [
      { id: 1 },
      { id: 2 },
      { id: 3 },
      { id: 4 },
      { id: 5 },
    ];

    const mockWorkItems = [
      { id: 1, fields: { 'System.Title': 'Item 1' } },
      { id: 2, fields: { 'System.Title': 'Item 2' } },
      { id: 3, fields: { 'System.Title': 'Item 3' } },
    ];

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => ({
        queryByWiql: jest.fn().mockResolvedValue({
          workItems: mockWorkItemRefs,
        }),
        getWorkItems: jest.fn().mockResolvedValue(mockWorkItems),
      })),
    };

    // Act - test skip and top pagination
    const result = await listWorkItems(mockConnection, {
      projectId: 'test-project',
      skip: 2, // Skip first 2 items
      top: 2, // Take only 2 items after skipping
    });

    // Assert
    expect(result).toEqual([
      { id: 3, fields: { 'System.Title': 'Item 3' } }, // Only item 3 should be returned (after skip 2 and taking 2)
    ]);
  });

  test('should propagate authentication errors', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => ({
        queryByWiql: jest.fn().mockImplementation(() => {
          throw new Error('Authentication failed: Invalid credentials');
        }),
      })),
    };

    // Act & Assert
    await expect(
      listWorkItems(mockConnection, { projectId: 'test-project' }),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);

    await expect(
      listWorkItems(mockConnection, { projectId: 'test-project' }),
    ).rejects.toThrow(
      'Failed to authenticate: Authentication failed: Invalid credentials',
    );
  });

  test('should propagate resource not found errors', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => ({
        queryByWiql: jest.fn().mockImplementation(() => {
          throw new Error('Project does not exist');
        }),
      })),
    };

    // Act & Assert
    await expect(
      listWorkItems(mockConnection, { projectId: 'non-existent-project' }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  test('should wrap generic errors with AzureDevOpsError', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => ({
        queryByWiql: jest.fn().mockImplementation(() => {
          throw new Error('Unexpected error');
        }),
      })),
    };

    // Act & Assert
    await expect(
      listWorkItems(mockConnection, { projectId: 'test-project' }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      listWorkItems(mockConnection, { projectId: 'test-project' }),
    ).rejects.toThrow('Failed to list work items: Unexpected error');
  });
});

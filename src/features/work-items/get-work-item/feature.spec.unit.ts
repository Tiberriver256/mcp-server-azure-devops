import { getWorkItem } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

function makeMockWitApi(overrides: Record<string, jest.Mock> = {}) {
  return {
    getWorkItem: jest.fn(),
    getWorkItemTypeFieldsWithReferences: jest.fn(),
    ...overrides,
  };
}

function makeMockConnection(witApi: ReturnType<typeof makeMockWitApi>) {
  return {
    getWorkItemTrackingApi: jest.fn().mockResolvedValue(witApi),
  } as any;
}

describe('getWorkItem unit', () => {
  test('should propagate custom errors when thrown internally', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(
      AzureDevOpsError,
    );
    await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(
      'Custom error',
    );
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(
      'Failed to get work item: Unexpected error',
    );
  });

  test('should throw AzureDevOpsResourceNotFoundError when work item is null', async () => {
    const witApi = makeMockWitApi();
    witApi.getWorkItem.mockResolvedValue(null);
    const conn = makeMockConnection(witApi);

    await expect(getWorkItem(conn, 999)).rejects.toThrow(
      AzureDevOpsResourceNotFoundError,
    );
    await expect(getWorkItem(conn, 999)).rejects.toThrow(
      "Work item '999' not found",
    );
  });

  test('should return work item as-is when project or type is missing', async () => {
    const witApi = makeMockWitApi();
    witApi.getWorkItem.mockResolvedValue({
      id: 1,
      fields: { 'System.Title': 'Test' },
    });
    const conn = makeMockConnection(witApi);

    const result = await getWorkItem(conn, 1);

    expect(result.id).toBe(1);
    expect(witApi.getWorkItemTypeFieldsWithReferences).not.toHaveBeenCalled();
  });

  test('should enrich work item fields with defaults from type definition', async () => {
    const witApi = makeMockWitApi();
    witApi.getWorkItem.mockResolvedValue({
      id: 42,
      fields: {
        'System.TeamProject': 'MyProject',
        'System.WorkItemType': 'Bug',
        'System.Title': 'A bug',
      },
    });
    witApi.getWorkItemTypeFieldsWithReferences.mockResolvedValue([
      { referenceName: 'System.Title', defaultValue: '' },
      { referenceName: 'System.Priority', defaultValue: 2 },
      { referenceName: 'Custom.Field', defaultValue: null },
    ]);
    const conn = makeMockConnection(witApi);

    const result = await getWorkItem(conn, 42);

    expect(result.fields!['System.Title']).toBe('A bug');
    expect(result.fields!['System.Priority']).toBe(2);
    expect(result.fields!['Custom.Field']).toBeNull();
    expect(witApi.getWorkItemTypeFieldsWithReferences).toHaveBeenCalledWith(
      'MyProject',
      'Bug',
      expect.any(Number),
    );
  });

  test('should use cached type fields on second call for same project/type', async () => {
    const witApi = makeMockWitApi();
    const workItem = {
      id: 10,
      fields: {
        'System.TeamProject': 'CachedProj',
        'System.WorkItemType': 'Task',
        'System.Title': 'Task 1',
      },
    };
    witApi.getWorkItem.mockResolvedValue(workItem);
    witApi.getWorkItemTypeFieldsWithReferences.mockResolvedValue([
      { referenceName: 'System.Title', defaultValue: '' },
    ]);
    const conn = makeMockConnection(witApi);

    await getWorkItem(conn, 10);
    await getWorkItem(conn, 10);

    expect(witApi.getWorkItemTypeFieldsWithReferences).toHaveBeenCalledTimes(1);
  });

  test('should pass expand parameter correctly', async () => {
    const witApi = makeMockWitApi();
    witApi.getWorkItem.mockResolvedValue({
      id: 5,
      fields: {},
    });
    const conn = makeMockConnection(witApi);

    await getWorkItem(conn, 5, 'relations');

    expect(witApi.getWorkItem).toHaveBeenCalledWith(
      5,
      undefined,
      undefined,
      expect.any(Number),
    );
  });

  test('should handle fields with no referenceName gracefully', async () => {
    const witApi = makeMockWitApi();
    witApi.getWorkItem.mockResolvedValue({
      id: 7,
      fields: {
        'System.TeamProject': 'Proj',
        'System.WorkItemType': 'Epic',
      },
    });
    witApi.getWorkItemTypeFieldsWithReferences.mockResolvedValue([
      { referenceName: undefined, defaultValue: 'x' },
      { referenceName: 'Custom.Valid', defaultValue: 'val' },
    ]);
    const conn = makeMockConnection(witApi);

    const result = await getWorkItem(conn, 7);

    expect(result.fields!['Custom.Valid']).toBe('val');
    expect(Object.keys(result.fields!)).not.toContain('undefined');
  });

  test('should wrap non-Error thrown values', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockRejectedValue('string error'),
    };

    await expect(getWorkItem(mockConnection, 1)).rejects.toThrow(
      'Failed to get work item: string error',
    );
  });
});

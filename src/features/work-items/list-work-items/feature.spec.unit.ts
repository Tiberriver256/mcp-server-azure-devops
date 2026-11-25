import type { WebApi } from 'azure-devops-node-api';
import { listWorkItems } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

describe('listWorkItems unit', () => {
  test('returns empty array without calling getWorkItems when WIQL matches nothing', async () => {
    const getWorkItems = jest.fn();
    const mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        queryByWiql: jest.fn().mockResolvedValue({ workItems: [] }),
        getWorkItems,
      }),
    } as unknown as WebApi;

    const result = await listWorkItems(mockConnection, {
      projectId: 'test-project',
    });

    expect(result).toEqual([]);
    expect(getWorkItems).not.toHaveBeenCalled();
  });

  test('applies skip and top pagination to the IDs requested from getWorkItems', async () => {
    const mockWorkItemRefs = [
      { id: 1 },
      { id: 2 },
      { id: 3 },
      { id: 4 },
      { id: 5 },
    ];
    const getWorkItems = jest
      .fn()
      .mockImplementation(async (ids: number[]) =>
        ids.map((id) => ({ id, fields: { 'System.Title': `Item ${id}` } })),
      );

    const mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        queryByWiql: jest
          .fn()
          .mockResolvedValue({ workItems: mockWorkItemRefs }),
        getWorkItems,
      }),
    } as unknown as WebApi;

    const result = await listWorkItems(mockConnection, {
      projectId: 'test-project',
      skip: 2,
      top: 2,
    });

    expect(getWorkItems).toHaveBeenCalledTimes(1);
    expect(getWorkItems.mock.calls[0][0]).toEqual([3, 4]);
    expect(result).toEqual([
      { id: 3, fields: { 'System.Title': 'Item 3' } },
      { id: 4, fields: { 'System.Title': 'Item 4' } },
    ]);
  });

  test('chunks getWorkItems requests into batches of at most 200 IDs', async () => {
    const mockWorkItemRefs = Array.from({ length: 450 }, (_, i) => ({
      id: i + 1,
    }));
    const getWorkItems = jest
      .fn()
      .mockImplementation(async (ids: number[]) =>
        ids.map((id) => ({ id, fields: { 'System.Title': `Item ${id}` } })),
      );

    const mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        queryByWiql: jest
          .fn()
          .mockResolvedValue({ workItems: mockWorkItemRefs }),
        getWorkItems,
      }),
    } as unknown as WebApi;

    const result = await listWorkItems(mockConnection, {
      projectId: 'test-project',
      top: 450,
    });

    expect(getWorkItems).toHaveBeenCalledTimes(3);
    expect(getWorkItems.mock.calls[0][0]).toHaveLength(200);
    expect(getWorkItems.mock.calls[1][0]).toHaveLength(200);
    expect(getWorkItems.mock.calls[2][0]).toHaveLength(50);
    expect(result).toHaveLength(450);
    expect(result[0].id).toBe(1);
    expect(result[449].id).toBe(450);
  });

  test('merges and deduplicates requested fields with default fields', async () => {
    const getWorkItems = jest
      .fn()
      .mockResolvedValue([{ id: 1, fields: { 'System.Title': 'Item 1' } }]);
    const mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        queryByWiql: jest.fn().mockResolvedValue({ workItems: [{ id: 1 }] }),
        getWorkItems,
      }),
    } as unknown as WebApi;

    await listWorkItems(mockConnection, {
      projectId: 'test-project',
      fields: ['System.Title', 'Microsoft.VSTS.Scheduling.StoryPoints'],
    });

    expect(getWorkItems.mock.calls[0][1]).toEqual([
      'System.Id',
      'System.Title',
      'System.State',
      'System.AssignedTo',
      'Microsoft.VSTS.Scheduling.StoryPoints',
    ]);
  });

  test('maps authentication, not-found, and generic errors to typed AzureDevOpsError subclasses', async () => {
    const makeFailingConn = (message: string) =>
      ({
        getWorkItemTrackingApi: jest.fn().mockResolvedValue({
          queryByWiql: jest.fn().mockRejectedValue(new Error(message)),
        }),
      }) as unknown as WebApi;

    await expect(
      listWorkItems(
        makeFailingConn('Authentication failed: Invalid credentials'),
        {
          projectId: 'p',
        },
      ),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);

    await expect(
      listWorkItems(makeFailingConn('Project does not exist'), {
        projectId: 'p',
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);

    await expect(
      listWorkItems(makeFailingConn('Unexpected error'), { projectId: 'p' }),
    ).rejects.toThrow(AzureDevOpsError);
  });
});

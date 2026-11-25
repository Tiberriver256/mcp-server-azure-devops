import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { listWorkItems } from './feature.ts';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors/index.ts';

void describe('listWorkItems unit', () => {
  void test('returns empty array without calling getWorkItems when WIQL matches nothing', async () => {
    const getWorkItems = mock.fn();
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          queryByWiql: mock.fn(() => Promise.resolve({ workItems: [] })),
          getWorkItems,
        }),
      ),
    } as unknown as WebApi;

    const result = await listWorkItems(mockConnection, {
      projectId: 'test-project',
    });

    assert.deepStrictEqual(result, []);
    assert.strictEqual(getWorkItems.mock.callCount(), 0);
  });

  void test('applies skip and top pagination to the IDs requested from getWorkItems', async () => {
    const mockWorkItemRefs = [
      { id: 1 },
      { id: 2 },
      { id: 3 },
      { id: 4 },
      { id: 5 },
    ];
    const getWorkItems = mock.fn((ids: number[]) =>
      Promise.resolve(
        ids.map((id) => ({ id, fields: { 'System.Title': `Item ${id}` } })),
      ),
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          queryByWiql: mock.fn(() =>
            Promise.resolve({ workItems: mockWorkItemRefs }),
          ),
          getWorkItems,
        }),
      ),
    } as unknown as WebApi;

    const result = await listWorkItems(mockConnection, {
      projectId: 'test-project',
      skip: 2,
      top: 2,
    });

    assert.strictEqual(getWorkItems.mock.callCount(), 1);
    assert.deepStrictEqual(getWorkItems.mock.calls[0]?.arguments[0], [3, 4]);
    assert.deepStrictEqual(result, [
      { id: 3, fields: { 'System.Title': 'Item 3' } },
      { id: 4, fields: { 'System.Title': 'Item 4' } },
    ]);
  });

  void test('chunks getWorkItems requests into batches of at most 200 IDs', async () => {
    const mockWorkItemRefs = Array.from({ length: 450 }, (_, i) => ({
      id: i + 1,
    }));
    const getWorkItems = mock.fn((ids: number[]) =>
      Promise.resolve(
        ids.map((id) => ({ id, fields: { 'System.Title': `Item ${id}` } })),
      ),
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          queryByWiql: mock.fn(() =>
            Promise.resolve({ workItems: mockWorkItemRefs }),
          ),
          getWorkItems,
        }),
      ),
    } as unknown as WebApi;

    const result = await listWorkItems(mockConnection, {
      projectId: 'test-project',
      top: 450,
    });

    assert.strictEqual(getWorkItems.mock.callCount(), 3);
    assert.strictEqual(getWorkItems.mock.calls[0]?.arguments[0].length, 200);
    assert.strictEqual(getWorkItems.mock.calls[1]?.arguments[0].length, 200);
    assert.strictEqual(getWorkItems.mock.calls[2]?.arguments[0].length, 50);
    assert.strictEqual(result.length, 450);
    assert.strictEqual(result[0].id, 1);
    assert.strictEqual(result[449].id, 450);
  });

  void test('merges and deduplicates requested fields with default fields', async () => {
    const getWorkItems = mock.fn((..._args: unknown[]) =>
      Promise.resolve([{ id: 1, fields: { 'System.Title': 'Item 1' } }]),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          queryByWiql: mock.fn(() =>
            Promise.resolve({ workItems: [{ id: 1 }] }),
          ),
          getWorkItems,
        }),
      ),
    } as unknown as WebApi;

    await listWorkItems(mockConnection, {
      projectId: 'test-project',
      fields: ['System.Title', 'Microsoft.VSTS.Scheduling.StoryPoints'],
    });

    assert.strictEqual(getWorkItems.mock.callCount(), 1);
    assert.deepStrictEqual(getWorkItems.mock.calls[0]?.arguments[1], [
      'System.Id',
      'System.Title',
      'System.State',
      'System.AssignedTo',
      'Microsoft.VSTS.Scheduling.StoryPoints',
    ]);
  });

  void test('maps authentication, not-found, and generic errors to typed AzureDevOpsError subclasses', async () => {
    const makeFailingConn = (message: string) =>
      ({
        getWorkItemTrackingApi: mock.fn(() =>
          Promise.resolve({
            queryByWiql: mock.fn(() => Promise.reject(new Error(message))),
          }),
        ),
      }) as unknown as WebApi;

    await assert.rejects(
      () =>
        listWorkItems(
          makeFailingConn('Authentication failed: Invalid credentials'),
          {
            projectId: 'p',
          },
        ),
      AzureDevOpsAuthenticationError,
    );

    await assert.rejects(
      () =>
        listWorkItems(makeFailingConn('Project does not exist'), {
          projectId: 'p',
        }),
      AzureDevOpsResourceNotFoundError,
    );

    await assert.rejects(
      () =>
        listWorkItems(makeFailingConn('Unexpected error'), { projectId: 'p' }),
      AzureDevOpsError,
    );
  });
});

import assert from 'node:assert/strict';
import { beforeEach, describe, mock, test } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { manageWorkItemLink } from './feature.ts';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors/index.ts';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';

type AsyncMockFn = (...args: unknown[]) => Promise<unknown>;

void describe('manageWorkItemLink', () => {
  let mockConnection: WebApi;
  let mockGetWorkItemTrackingApi: Mock<() => Promise<unknown>>;
  let mockUpdateWorkItem: Mock<AsyncMockFn>;
  let mockGetWorkItem: Mock<AsyncMockFn>;

  const projectId = 'test-project';
  const sourceWorkItemId = 123;
  const targetWorkItemId = 456;
  const relationType = 'System.LinkTypes.Related';
  const newRelationType = 'System.LinkTypes.Hierarchy-Forward';
  const comment = 'Test link comment';

  beforeEach(() => {
    mockUpdateWorkItem = mock.fn<AsyncMockFn>(() => Promise.resolve(undefined));
    mockGetWorkItem = mock.fn<AsyncMockFn>(() => Promise.resolve(undefined));
    mockGetWorkItemTrackingApi = mock.fn(() =>
      Promise.resolve({
        updateWorkItem: mockUpdateWorkItem,
        getWorkItem: mockGetWorkItem,
      }),
    );

    mockConnection = {
      getWorkItemTrackingApi: mockGetWorkItemTrackingApi,
      serverUrl: 'https://dev.azure.com/test-org',
    } as unknown as WebApi;
  });

  void test('should add a work item link', async () => {
    // Setup
    const updatedWorkItem = {
      id: sourceWorkItemId,
      fields: { 'System.Title': 'Test' },
    };
    mockUpdateWorkItem.mock.mockImplementation(() =>
      Promise.resolve(updatedWorkItem),
    );

    // Execute
    const result = await manageWorkItemLink(mockConnection, projectId, {
      sourceWorkItemId,
      targetWorkItemId,
      operation: 'add',
      relationType,
      comment,
    });

    // Verify
    assert.strictEqual(mockGetWorkItemTrackingApi.mock.callCount(), 1);
    assert.strictEqual(mockUpdateWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockUpdateWorkItem.mock.calls[0]?.arguments, [
      {}, // customHeaders
      [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: relationType,
            url: `${mockConnection.serverUrl}/_apis/wit/workItems/${targetWorkItemId}`,
            attributes: { comment },
          },
        },
      ],
      sourceWorkItemId,
      projectId,
    ]);
    assert.deepStrictEqual(result, updatedWorkItem);
  });

  void test('should remove a work item link', async () => {
    // Setup
    const updatedWorkItem = {
      id: sourceWorkItemId,
      fields: { 'System.Title': 'Test' },
    };
    mockGetWorkItem.mock.mockImplementation(() =>
      Promise.resolve({
        id: sourceWorkItemId,
        relations: [
          {
            rel: relationType,
            url: `${mockConnection.serverUrl}/_apis/wit/workItems/${targetWorkItemId}`,
          },
        ],
      }),
    );
    mockUpdateWorkItem.mock.mockImplementation(() =>
      Promise.resolve(updatedWorkItem),
    );

    // Execute
    const result = await manageWorkItemLink(mockConnection, projectId, {
      sourceWorkItemId,
      targetWorkItemId,
      operation: 'remove',
      relationType,
    });

    // Verify
    assert.strictEqual(mockGetWorkItemTrackingApi.mock.callCount(), 1);
    assert.strictEqual(mockGetWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetWorkItem.mock.calls[0]?.arguments, [
      sourceWorkItemId,
      undefined,
      undefined,
      WorkItemExpand.Relations,
    ]);
    assert.strictEqual(mockUpdateWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockUpdateWorkItem.mock.calls[0]?.arguments, [
      {}, // customHeaders
      [
        {
          op: 'remove',
          path: '/relations/0',
        },
      ],
      sourceWorkItemId,
      projectId,
    ]);
    assert.deepStrictEqual(result, updatedWorkItem);
  });

  void test('should update a work item link', async () => {
    // Setup
    const updatedWorkItem = {
      id: sourceWorkItemId,
      fields: { 'System.Title': 'Test' },
    };
    mockGetWorkItem.mock.mockImplementation(() =>
      Promise.resolve({
        id: sourceWorkItemId,
        relations: [
          {
            rel: relationType,
            url: `${mockConnection.serverUrl}/_apis/wit/workItems/${targetWorkItemId}`,
          },
        ],
      }),
    );
    mockUpdateWorkItem.mock.mockImplementation(() =>
      Promise.resolve(updatedWorkItem),
    );

    // Execute
    const result = await manageWorkItemLink(mockConnection, projectId, {
      sourceWorkItemId,
      targetWorkItemId,
      operation: 'update',
      relationType,
      newRelationType,
      comment,
    });

    // Verify
    assert.strictEqual(mockGetWorkItemTrackingApi.mock.callCount(), 1);
    assert.strictEqual(mockGetWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetWorkItem.mock.calls[0]?.arguments, [
      sourceWorkItemId,
      undefined,
      undefined,
      WorkItemExpand.Relations,
    ]);
    assert.strictEqual(mockUpdateWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockUpdateWorkItem.mock.calls[0]?.arguments, [
      {}, // customHeaders
      [
        {
          op: 'remove',
          path: '/relations/0',
        },
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: newRelationType,
            url: `${mockConnection.serverUrl}/_apis/wit/workItems/${targetWorkItemId}`,
            attributes: { comment },
          },
        },
      ],
      sourceWorkItemId,
      projectId,
    ]);
    assert.deepStrictEqual(result, updatedWorkItem);
  });

  void test('should throw error when work item not found', async () => {
    // Setup
    mockUpdateWorkItem.mock.mockImplementation(() => Promise.resolve(null));

    // Execute and verify
    await assert.rejects(
      () =>
        manageWorkItemLink(mockConnection, projectId, {
          sourceWorkItemId,
          targetWorkItemId,
          operation: 'add',
          relationType,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void test('should throw error when update operation missing newRelationType', async () => {
    // Execute and verify
    await assert.rejects(
      () =>
        manageWorkItemLink(mockConnection, projectId, {
          sourceWorkItemId,
          targetWorkItemId,
          operation: 'update',
          relationType,
          // newRelationType is missing
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(
          err.message,
          /New relation type is required for update operation/,
        );
        return true;
      },
    );
  });

  void test('should throw error when relation to remove is not found', async () => {
    // Setup
    mockGetWorkItem.mock.mockImplementation(() =>
      Promise.resolve({
        id: sourceWorkItemId,
        relations: [
          {
            rel: 'Some.Other.LinkType',
            url: `${mockConnection.serverUrl}/_apis/wit/workItems/999`,
          },
        ],
      }),
    );

    // Execute and verify
    await assert.rejects(
      () =>
        manageWorkItemLink(mockConnection, projectId, {
          sourceWorkItemId,
          targetWorkItemId,
          operation: 'remove',
          relationType,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });
});

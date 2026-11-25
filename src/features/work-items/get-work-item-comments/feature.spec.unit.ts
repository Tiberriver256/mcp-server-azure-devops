import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getWorkItemComments } from './feature.ts';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors/index.ts';
import {
  CommentExpandOptions,
  CommentSortOrder,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';

void describe('getWorkItemComments unit', () => {
  void test('should propagate custom errors when thrown internally', async () => {
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    } as unknown as WebApi;

    await assert.rejects(
      () => getWorkItemComments(mockConnection, { workItemId: 123 }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsError);
        assert.strictEqual(err.message, 'Custom error');
        return true;
      },
    );
  });

  void test('should wrap unexpected errors in a friendly error message', async () => {
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() => {
        throw new Error('Unexpected error');
      }),
    } as unknown as WebApi;

    await assert.rejects(
      () => getWorkItemComments(mockConnection, { workItemId: 123 }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Failed to get work item comments: Unexpected error',
        );
        return true;
      },
    );
  });

  void test('should call getComments with correct parameters when projectId is provided', async () => {
    const mockGetComments = mock.fn((..._args: unknown[]) =>
      Promise.resolve({ comments: [] }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getComments: mockGetComments,
        }),
      ),
    } as unknown as WebApi;

    await getWorkItemComments(mockConnection, {
      workItemId: 123,
      projectId: 'myProject',
      top: 5,
      continuationToken: 'token123',
      includeDeleted: true,
      expand: 'reactions',
      order: 'desc',
    });

    assert.strictEqual(mockGetComments.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetComments.mock.calls[0]?.arguments, [
      'myProject',
      123,
      5,
      'token123',
      true,
      CommentExpandOptions.Reactions,
      CommentSortOrder.Desc,
    ]);
  });

  void test('should fetch work item to resolve project when projectId is not provided', async () => {
    const mockGetWorkItem = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        fields: {
          'System.TeamProject': 'resolvedProject',
        },
      }),
    );
    const mockGetComments = mock.fn((..._args: unknown[]) =>
      Promise.resolve({ comments: [] }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mockGetWorkItem,
          getComments: mockGetComments,
        }),
      ),
    } as unknown as WebApi;

    await getWorkItemComments(mockConnection, {
      workItemId: 123,
    });

    assert.strictEqual(mockGetWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetWorkItem.mock.calls[0]?.arguments, [
      123,
      ['System.TeamProject'],
    ]);
    assert.strictEqual(mockGetComments.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetComments.mock.calls[0]?.arguments, [
      'resolvedProject',
      123,
      undefined,
      undefined,
      undefined,
      CommentExpandOptions.All,
      CommentSortOrder.Asc,
    ]);
  });

  void test('should map 404 project resolution errors to resource not found', async () => {
    const notFoundError = Object.assign(new Error('Not found'), {
      statusCode: 404,
    });
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mock.fn(() => Promise.reject(notFoundError)),
          getComments: mock.fn(),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () => getWorkItemComments(mockConnection, { workItemId: 123 }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void test('should preserve non-404 project resolution errors', async () => {
    const forbiddenError = Object.assign(new Error('Forbidden'), {
      statusCode: 403,
    });
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mock.fn(() => Promise.reject(forbiddenError)),
          getComments: mock.fn(),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () => getWorkItemComments(mockConnection, { workItemId: 123 }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Failed to get work item comments: Forbidden',
        );
        return true;
      },
    );
  });
});

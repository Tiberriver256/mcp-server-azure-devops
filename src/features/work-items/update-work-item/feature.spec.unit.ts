import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { updateWorkItem } from './feature.ts';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';

type AsyncMockFn = (...args: unknown[]) => Promise<unknown>;

function assertUpdateWorkItemCall(
  mockUpdateWorkItem: Mock<AsyncMockFn>,
  expectedDocument: ReadonlyArray<{
    op: string;
    path: string;
    value: unknown;
  }>,
): void {
  assert.strictEqual(mockUpdateWorkItem.mock.callCount(), 1);
  const args = mockUpdateWorkItem.mock.calls[0]?.arguments;
  assert.ok(args);
  assert.strictEqual(args.length, 8);
  assert.deepStrictEqual(args.slice(0, 7), [
    {},
    expectedDocument,
    123,
    undefined,
    false,
    false,
    false,
  ]);
  assert.strictEqual(typeof args[7], 'number');
}

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
void describe('updateWorkItem unit', () => {
  void test('should throw error when no fields are provided for update', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(),
    } as unknown as WebApi;

    // Act & Assert - empty options object should throw
    await assert.rejects(
      () =>
        updateWorkItem(
          mockConnection,
          123,
          {}, // No fields to update
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(
          err.message,
          /At least one field must be provided for update/,
        );
        return true;
      },
    );
  });

  void test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    } as unknown as WebApi;

    // Act & Assert
    await assert.rejects(
      () => updateWorkItem(mockConnection, 123, { title: 'Updated Title' }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsError);
        assert.strictEqual(err.message, 'Custom error');
        return true;
      },
    );
  });

  void test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() => {
        throw new Error('Unexpected error');
      }),
    } as unknown as WebApi;

    // Act & Assert
    await assert.rejects(
      () => updateWorkItem(mockConnection, 123, { title: 'Updated Title' }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Failed to update work item: Unexpected error',
        );
        return true;
      },
    );
  });

  void test('should overwrite tags using replace when existing tags are present', async () => {
    const mockGetWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({
        id: 123,
        fields: { 'System.Tags': 'old1; old2' },
      }),
    );
    const mockUpdateWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({ id: 123 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mockGetWorkItem,
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await updateWorkItem(mockConnection, 123, {
      tags: ['tag1', 'tag2'],
    });

    assert.strictEqual(mockGetWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetWorkItem.mock.calls[0]?.arguments, [
      123,
      ['System.Tags'],
    ]);
    assertUpdateWorkItemCall(mockUpdateWorkItem, [
      {
        op: 'replace',
        path: '/fields/System.Tags',
        value: 'tag1; tag2',
      },
    ]);
  });

  void test('should overwrite tags using add when no existing tags', async () => {
    const mockGetWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({
        id: 123,
        fields: {},
      }),
    );
    const mockUpdateWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({ id: 123 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mockGetWorkItem,
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await updateWorkItem(mockConnection, 123, {
      tags: ['tag1', 'tag2'],
    });

    assert.strictEqual(mockGetWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetWorkItem.mock.calls[0]?.arguments, [
      123,
      ['System.Tags'],
    ]);
    assertUpdateWorkItemCall(mockUpdateWorkItem, [
      {
        op: 'add',
        path: '/fields/System.Tags',
        value: 'tag1; tag2',
      },
    ]);
  });

  void test('should clear tags using replace when existing tags are present', async () => {
    const mockGetWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({
        id: 123,
        fields: { 'System.Tags': 'old1; old2' },
      }),
    );
    const mockUpdateWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({ id: 123 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mockGetWorkItem,
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await updateWorkItem(mockConnection, 123, {
      tags: [],
    });

    assert.strictEqual(mockGetWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetWorkItem.mock.calls[0]?.arguments, [
      123,
      ['System.Tags'],
    ]);
    assertUpdateWorkItemCall(mockUpdateWorkItem, [
      {
        op: 'replace',
        path: '/fields/System.Tags',
        value: '',
      },
    ]);
  });

  void test('should clear tags using add when no existing tags', async () => {
    const mockGetWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({
        id: 123,
        fields: {},
      }),
    );
    const mockUpdateWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({ id: 123 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mockGetWorkItem,
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await updateWorkItem(mockConnection, 123, {
      tags: [],
    });

    assert.strictEqual(mockGetWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetWorkItem.mock.calls[0]?.arguments, [
      123,
      ['System.Tags'],
    ]);
    assertUpdateWorkItemCall(mockUpdateWorkItem, [
      {
        op: 'add',
        path: '/fields/System.Tags',
        value: '',
      },
    ]);
  });

  void test('should fetch and add tags when tagsToAdd is provided', async () => {
    const mockGetWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({
        id: 123,
        fields: {
          'System.Tags': 'existing1; existing2',
        },
      }),
    );
    const mockUpdateWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({ id: 123 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mockGetWorkItem,
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await updateWorkItem(mockConnection, 123, {
      tagsToAdd: ['existing2', 'newTag'],
    });

    assert.strictEqual(mockGetWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetWorkItem.mock.calls[0]?.arguments, [
      123,
      ['System.Tags'],
    ]);
    assertUpdateWorkItemCall(mockUpdateWorkItem, [
      {
        op: 'replace',
        path: '/fields/System.Tags',
        value: 'existing1; existing2; newTag',
      },
    ]);
  });

  void test('should fetch and remove tags when tagsToRemove is provided', async () => {
    const mockGetWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({
        id: 123,
        fields: {
          'System.Tags': 'existing1; existing2; existing3',
        },
      }),
    );
    const mockUpdateWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({ id: 123 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mockGetWorkItem,
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await updateWorkItem(mockConnection, 123, {
      tagsToRemove: ['existing2', 'nonExistent'],
    });

    assert.strictEqual(mockGetWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetWorkItem.mock.calls[0]?.arguments, [
      123,
      ['System.Tags'],
    ]);
    assertUpdateWorkItemCall(mockUpdateWorkItem, [
      {
        op: 'replace',
        path: '/fields/System.Tags',
        value: 'existing1; existing3',
      },
    ]);
  });

  void test('should remove tags case-insensitively', async () => {
    const mockGetWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({
        id: 123,
        fields: {
          'System.Tags': 'Bug; Feature; Enhancement',
        },
      }),
    );
    const mockUpdateWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({ id: 123 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mockGetWorkItem,
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await updateWorkItem(mockConnection, 123, {
      tagsToRemove: ['bug', 'FEATURE'],
    });

    assertUpdateWorkItemCall(mockUpdateWorkItem, [
      {
        op: 'replace',
        path: '/fields/System.Tags',
        value: 'Enhancement',
      },
    ]);
  });

  void test('should not add duplicate tags case-insensitively', async () => {
    const mockGetWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({
        id: 123,
        fields: {
          'System.Tags': 'Bug; Feature',
        },
      }),
    );
    const mockUpdateWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({ id: 123 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mockGetWorkItem,
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await updateWorkItem(mockConnection, 123, {
      tagsToAdd: ['bug', 'NewTag'],
    });

    assertUpdateWorkItemCall(mockUpdateWorkItem, [
      {
        op: 'replace',
        path: '/fields/System.Tags',
        value: 'Bug; Feature; NewTag',
      },
    ]);
  });

  void test('should include multilineFieldsFormat patch entry when descriptionFormat is markdown', async () => {
    const mockUpdateWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({ id: 123 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await updateWorkItem(mockConnection, 123, {
      description: '## Updated\n- item',
      descriptionFormat: 'markdown',
    });

    assertUpdateWorkItemCall(mockUpdateWorkItem, [
      {
        op: 'add',
        path: '/fields/System.Description',
        value: '## Updated\n- item',
      },
      {
        op: 'add',
        path: '/multilineFieldsFormat/System.Description',
        value: 'Markdown',
      },
    ]);
  });

  void test('should allow setting descriptionFormat to markdown without changing description text', async () => {
    const mockUpdateWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({ id: 123 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await updateWorkItem(mockConnection, 123, {
      descriptionFormat: 'markdown',
    });

    assertUpdateWorkItemCall(mockUpdateWorkItem, [
      {
        op: 'add',
        path: '/multilineFieldsFormat/System.Description',
        value: 'Markdown',
      },
    ]);
  });

  void test('should not include multilineFieldsFormat patch entry when descriptionFormat is omitted or html', async () => {
    const mockUpdateWorkItem = mock.fn<AsyncMockFn>(() =>
      Promise.resolve({ id: 123 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await updateWorkItem(mockConnection, 123, {
      description: '<p>Updated</p>',
      descriptionFormat: 'html',
    });

    assertUpdateWorkItemCall(mockUpdateWorkItem, [
      {
        op: 'add',
        path: '/fields/System.Description',
        value: '<p>Updated</p>',
      },
    ]);
  });
});

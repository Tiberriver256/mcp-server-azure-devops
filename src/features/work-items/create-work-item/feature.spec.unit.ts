import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { createWorkItem } from './feature.ts';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';

interface JsonPatchEntry {
  op: string;
  path: string;
  value: unknown;
}

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
void describe('createWorkItem unit', () => {
  // Test for required title validation
  void test('should throw error when title is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(),
    } as unknown as WebApi;

    // Act & Assert
    await assert.rejects(
      () =>
        createWorkItem(
          mockConnection,
          'TestProject',
          'Task',
          { title: '' }, // Empty title
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Title is required/);
        return true;
      },
    );
  });

  // Test for error propagation
  void test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    } as unknown as WebApi;

    // Act & Assert
    await assert.rejects(
      () =>
        createWorkItem(mockConnection, 'TestProject', 'Task', {
          title: 'Test Task',
        }),
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
      () =>
        createWorkItem(mockConnection, 'TestProject', 'Task', {
          title: 'Test Task',
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Failed to create work item: Unexpected error',
        );
        return true;
      },
    );
  });

  void test('should include System.Tags patch entry when tags option is provided', async () => {
    const mockCreateWorkItem = mock.fn((..._args: unknown[]) =>
      Promise.resolve({ id: 1 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          createWorkItem: mockCreateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Test Task',
      tags: ['bug', 'frontend'],
    });

    assert.strictEqual(mockCreateWorkItem.mock.callCount(), 1);
    const args = mockCreateWorkItem.mock.calls[0]?.arguments;
    assert.ok(args);
    assert.strictEqual(args.length, 4);
    assert.strictEqual(args[0], null);
    const document = args[1] as JsonPatchEntry[];
    assert.ok(Array.isArray(document));
    assert.deepStrictEqual(
      document.find((entry) => entry.path === '/fields/System.Tags'),
      {
        op: 'add',
        path: '/fields/System.Tags',
        value: 'bug; frontend',
      },
    );
    assert.strictEqual(args[2], 'TestProject');
    assert.strictEqual(args[3], 'Task');
  });

  void test('should not include System.Tags patch entry when tags option is empty', async () => {
    const mockCreateWorkItem = mock.fn((..._args: unknown[]) =>
      Promise.resolve({ id: 1 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          createWorkItem: mockCreateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Test Task',
      tags: [],
    });

    assert.strictEqual(mockCreateWorkItem.mock.callCount(), 1);
    const document = mockCreateWorkItem.mock.calls[0]
      ?.arguments[1] as JsonPatchEntry[];
    assert.ok(Array.isArray(document));
    const tagsPatch = document.find(
      (entry) => entry.path === '/fields/System.Tags',
    );
    assert.strictEqual(tagsPatch, undefined);
  });

  void test('should include multilineFieldsFormat patch entry when descriptionFormat is markdown', async () => {
    const mockCreateWorkItem = mock.fn((..._args: unknown[]) =>
      Promise.resolve({ id: 1 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          createWorkItem: mockCreateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Markdown Task',
      description: '## Heading\n- item 1',
      descriptionFormat: 'markdown',
    });

    assert.strictEqual(mockCreateWorkItem.mock.callCount(), 1);
    const args = mockCreateWorkItem.mock.calls[0]?.arguments;
    assert.ok(args);
    assert.strictEqual(args.length, 4);
    assert.strictEqual(args[0], null);
    const document = args[1] as JsonPatchEntry[];
    assert.ok(Array.isArray(document));
    assert.deepStrictEqual(
      document.find((entry) => entry.path === '/fields/System.Description'),
      {
        op: 'add',
        path: '/fields/System.Description',
        value: '## Heading\n- item 1',
      },
    );
    assert.deepStrictEqual(
      document.find(
        (entry) => entry.path === '/multilineFieldsFormat/System.Description',
      ),
      {
        op: 'add',
        path: '/multilineFieldsFormat/System.Description',
        value: 'Markdown',
      },
    );
    assert.strictEqual(args[2], 'TestProject');
    assert.strictEqual(args[3], 'Task');
  });

  void test('should not include multilineFieldsFormat patch entry when descriptionFormat is omitted or html', async () => {
    const mockCreateWorkItem = mock.fn((..._args: unknown[]) =>
      Promise.resolve({ id: 1 }),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          createWorkItem: mockCreateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Default HTML Task',
      description: '<p>Hello</p>',
    });

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Explicit HTML Task',
      description: '<p>Hello</p>',
      descriptionFormat: 'html',
    });

    assert.strictEqual(mockCreateWorkItem.mock.callCount(), 2);
    for (const call of mockCreateWorkItem.mock.calls) {
      const document = call.arguments[1] as JsonPatchEntry[];
      assert.ok(Array.isArray(document));
      const formatPatch = document.find(
        (entry) => entry.path === '/multilineFieldsFormat/System.Description',
      );
      assert.strictEqual(formatPatch, undefined);
    }
  });
});

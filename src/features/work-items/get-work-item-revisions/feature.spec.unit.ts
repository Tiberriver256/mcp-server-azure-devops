import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import { getWorkItemRevisions } from './feature.ts';
import { GetWorkItemRevisionsSchema } from '../schemas.ts';
import { workItemsFeature } from '../index.ts';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';

void describe('getWorkItemRevisions unit', () => {
  void test('lists revisions with bounded default top=50 and expand=none', async () => {
    const seeded = [
      { id: 101, rev: 1, fields: { 'System.State': 'New' } },
      { id: 101, rev: 2, fields: { 'System.State': 'Active' } },
    ];
    const mockGetRevisions = mock.fn((..._args: unknown[]) =>
      Promise.resolve(seeded),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getRevisions: mockGetRevisions,
        }),
      ),
    } as unknown as WebApi;

    const result = await getWorkItemRevisions(mockConnection, {
      workItemId: 101,
    });

    assert.deepStrictEqual(result, seeded);
    assert.strictEqual(mockGetRevisions.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetRevisions.mock.calls[0]?.arguments, [
      101,
      50,
      undefined,
      WorkItemExpand.None,
      undefined,
    ]);
  });

  void test('passes explicit top, skip, expand, and projectId to getRevisions', async () => {
    const mockGetRevisions = mock.fn((..._args: unknown[]) =>
      Promise.resolve([]),
    );
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getRevisions: mockGetRevisions,
        }),
      ),
    } as unknown as WebApi;

    await getWorkItemRevisions(mockConnection, {
      workItemId: 101,
      projectId: 'DemoProject',
      top: 25,
      skip: 10,
      expand: 'relations',
    });

    assert.strictEqual(mockGetRevisions.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetRevisions.mock.calls[0]?.arguments, [
      101,
      25,
      10,
      WorkItemExpand.Relations,
      'DemoProject',
    ]);
  });

  void test('fetches a single revision via getRevision when revisionNumber is specified', async () => {
    const rev1 = {
      id: 101,
      rev: 1,
      fields: { 'System.Title': 'Initial', 'System.State': 'New' },
    };
    const mockGetRevision = mock.fn((..._args: unknown[]) =>
      Promise.resolve(rev1),
    );
    const mockGetRevisions = mock.fn();
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getRevision: mockGetRevision,
          getRevisions: mockGetRevisions,
        }),
      ),
    } as unknown as WebApi;

    const result = await getWorkItemRevisions(mockConnection, {
      workItemId: 101,
      projectId: 'DemoProject',
      revisionNumber: 1,
      expand: 'all',
    });

    assert.deepStrictEqual(result, rev1);
    assert.strictEqual(mockGetRevision.mock.callCount(), 1);
    assert.strictEqual(mockGetRevisions.mock.callCount(), 0);
    assert.deepStrictEqual(mockGetRevision.mock.calls[0]?.arguments, [
      101,
      1,
      WorkItemExpand.All,
      'DemoProject',
    ]);
  });

  void test('throws AzureDevOpsResourceNotFoundError when single revision returns null (404)', async () => {
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getRevision: mock.fn(() => Promise.resolve(null)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getWorkItemRevisions(mockConnection, {
          workItemId: 101,
          revisionNumber: 999,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsResourceNotFoundError);
        assert.match(err.message, /999/);
        return true;
      },
    );
  });

  void test('throws AzureDevOpsResourceNotFoundError when getRevisions returns null (404)', async () => {
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getRevisions: mock.fn(() => Promise.resolve(null)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getWorkItemRevisions(mockConnection, {
          workItemId: 999999,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void test('rejects out-of-range top and negative skip with zero API calls', async () => {
    const mockGetApi = mock.fn();
    const mockConnection = {
      getWorkItemTrackingApi: mockGetApi,
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getWorkItemRevisions(mockConnection, {
          workItemId: 101,
          top: 250,
        }),
      AzureDevOpsValidationError,
    );
    await assert.rejects(
      () =>
        getWorkItemRevisions(mockConnection, {
          workItemId: 101,
          top: 0,
        }),
      AzureDevOpsValidationError,
    );
    await assert.rejects(
      () =>
        getWorkItemRevisions(mockConnection, {
          workItemId: 101,
          skip: -1,
        }),
      AzureDevOpsValidationError,
    );
    await assert.rejects(
      () =>
        getWorkItemRevisions(mockConnection, {
          workItemId: 101,
          revisionNumber: 0,
        }),
      AzureDevOpsValidationError,
    );

    assert.strictEqual(mockGetApi.mock.callCount(), 0);
  });

  void test('wraps unexpected errors in AzureDevOpsError', async () => {
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() => {
        throw new Error('Boom');
      }),
    } as unknown as WebApi;

    await assert.rejects(
      () => getWorkItemRevisions(mockConnection, { workItemId: 101 }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsError);
        assert.strictEqual(
          err.message,
          'Failed to get work item revisions: Boom',
        );
        return true;
      },
    );
  });

  void test('validates schema bounds and registers get_work_item_revisions as read-only tool', () => {
    assert.throws(() =>
      GetWorkItemRevisionsSchema.parse({ workItemId: 101, top: 250 }),
    );
    assert.throws(() =>
      GetWorkItemRevisionsSchema.parse({ workItemId: 101, skip: -1 }),
    );
    const parsed = GetWorkItemRevisionsSchema.parse({ workItemId: 101 });
    assert.strictEqual(parsed.top, 50);
    assert.strictEqual(parsed.expand, 'none');

    const tool = workItemsFeature.tools.find(
      (t) => t.name === 'get_work_item_revisions',
    );
    assert.ok(tool);
    assert.strictEqual(tool.readOnly, true);
    assert.strictEqual(tool.annotations.readOnlyHint, true);
    const def = tool.toDefinition();
    assert.ok(def.inputSchema && typeof def.inputSchema === 'object');
  });
});

import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import {
  getIterationWorkItems,
  MAX_WORK_ITEM_HYDRATION_BATCH_SIZE,
} from './feature.ts';

const SPRINT_2_UUID = '10000000-0000-4000-8000-000000000002';

void describe('getIterationWorkItems unit', () => {
  void test('rejects non-UUID iterationIds (integers, names, traversal, empty) fail-fast before any HTTP call', async () => {
    const mockGetWorkApi = mock.fn();
    const mockGetWitApi = mock.fn();
    const mockConnection = {
      getWorkApi: mockGetWorkApi,
      getWorkItemTrackingApi: mockGetWitApi,
    } as unknown as WebApi;

    const invalidIds = [
      '102',
      '42',
      'Sprint 2',
      '../other',
      '',
      '   ',
      '10000000-0000-4000-8000-00000000000g',
    ];

    for (const badId of invalidIds) {
      await assert.rejects(
        () =>
          getIterationWorkItems(mockConnection, {
            projectId: 'DemoProject',
            teamId: 'DemoProject Team',
            iterationId: badId,
          }),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsValidationError);
          assert.match(err.message, /uuid|guid|iterationId/i);
          return true;
        },
      );
    }

    assert.strictEqual(mockGetWorkApi.mock.callCount(), 0);
    assert.strictEqual(mockGetWitApi.mock.callCount(), 0);
  });

  void test('fetches iteration work item relations and deduplicates target IDs without calling WIT API by default', async () => {
    const mockGetIterationWorkItems = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        workItemRelations: [
          { rel: null, source: null, target: { id: 101 } },
          {
            rel: 'System.LinkTypes.Hierarchy-Forward',
            source: { id: 101 },
            target: { id: 102 },
          },
          {
            rel: 'System.LinkTypes.Hierarchy-Forward',
            source: { id: 101 },
            target: { id: 102 },
          },
        ],
        url: `https://dev.azure.com/org/DemoProject/_apis/work/teamsettings/iterations/${SPRINT_2_UUID}/workitems`,
      }),
    );
    const mockGetWitApi = mock.fn();

    const mockConnection = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getIterationWorkItems: mockGetIterationWorkItems,
        }),
      ),
      getWorkItemTrackingApi: mockGetWitApi,
    } as unknown as WebApi;

    const result = await getIterationWorkItems(mockConnection, {
      projectId: 'DemoProject',
      iterationId: `  ${SPRINT_2_UUID}  `,
    });

    assert.strictEqual(mockGetIterationWorkItems.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetIterationWorkItems.mock.calls[0]?.arguments, [
      { project: 'DemoProject', team: undefined },
      SPRINT_2_UUID,
    ]);
    assert.strictEqual(mockGetWitApi.mock.callCount(), 0);

    assert.strictEqual(result.iterationId, SPRINT_2_UUID);
    assert.strictEqual(result.projectId, 'DemoProject');
    assert.strictEqual(result.count, 2);
    assert.deepStrictEqual(result.workItemIds, [101, 102]);
    assert.strictEqual(result.workItemRelations.length, 3);
    assert.strictEqual(result.workItems, undefined);
  });

  void test('hydrates work item details in batches of <=200 when includeWorkItemDetails is true', async () => {
    const totalItems = 450;
    const relations = Array.from({ length: totalItems }, (_, idx) => ({
      rel: null,
      source: null,
      target: { id: idx + 1 },
    }));

    const mockGetIterationWorkItems = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        workItemRelations: relations,
      }),
    );
    const mockGetWorkItems = mock.fn(
      (
        ids: number[],
        _fields?: string[],
        _asOf?: Date,
        _expand?: unknown,
        _errorPolicy?: unknown,
        _project?: string,
      ) =>
        Promise.resolve(
          ids.map((id) => ({
            id,
            fields: { 'System.Title': `Item ${id}` },
          })),
        ),
    );

    const mockConnection = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getIterationWorkItems: mockGetIterationWorkItems,
        }),
      ),
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItems: mockGetWorkItems,
        }),
      ),
    } as unknown as WebApi;

    const fields = ['System.Title', 'System.State'];
    const result = await getIterationWorkItems(mockConnection, {
      projectId: 'DemoProject',
      teamId: 'DemoProject Team',
      iterationId: SPRINT_2_UUID,
      includeWorkItemDetails: true,
      fields,
    });

    assert.strictEqual(result.count, totalItems);
    assert.strictEqual(result.workItems?.length, totalItems);
    assert.strictEqual(mockGetWorkItems.mock.callCount(), 3);

    const batchSizes = mockGetWorkItems.mock.calls.map(
      (call) => call.arguments[0].length,
    );
    assert.deepStrictEqual(batchSizes, [
      MAX_WORK_ITEM_HYDRATION_BATCH_SIZE,
      MAX_WORK_ITEM_HYDRATION_BATCH_SIZE,
      50,
    ]);
    assert.deepStrictEqual(
      mockGetWorkItems.mock.calls[0]?.arguments[1],
      fields,
    );
    assert.strictEqual(
      mockGetWorkItems.mock.calls[0]?.arguments[5],
      'DemoProject',
    );
  });

  void test('returns empty workItems array without calling WIT API when iteration has zero items', async () => {
    const mockGetWitApi = mock.fn();
    const mockConnection = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getIterationWorkItems: mock.fn(() =>
            Promise.resolve({ workItemRelations: [] }),
          ),
        }),
      ),
      getWorkItemTrackingApi: mockGetWitApi,
    } as unknown as WebApi;

    const result = await getIterationWorkItems(mockConnection, {
      projectId: 'DemoProject',
      iterationId: SPRINT_2_UUID,
      includeWorkItemDetails: true,
    });

    assert.strictEqual(result.count, 0);
    assert.deepStrictEqual(result.workItemIds, []);
    assert.deepStrictEqual(result.workItems, []);
    assert.strictEqual(mockGetWitApi.mock.callCount(), 0);
  });

  void test('maps 404 iteration not found to AzureDevOpsResourceNotFoundError', async () => {
    const notFoundErr = Object.assign(new Error('Iteration not found'), {
      statusCode: 404,
    });
    const mockConnection = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getIterationWorkItems: mock.fn(() => Promise.reject(notFoundErr)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getIterationWorkItems(mockConnection, {
          projectId: 'DemoProject',
          iterationId: SPRINT_2_UUID,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });
});

import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import {
  TreeNodeStructureType,
  TreeStructureGroup,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { DEFAULT_ITERATION_DEPTH, listIterations } from './feature.ts';

const ROOT_UUID = '10000000-0000-4000-8000-000000000000';
const SPRINT_1_UUID = '10000000-0000-4000-8000-000000000001';
const SPRINT_2_UUID = '10000000-0000-4000-8000-000000000002';

void describe('listIterations unit', () => {
  void test('calls getClassificationNode with default depth=5 and preserves both integer id and UUID identifier recursively', async () => {
    const mockGetClassificationNode = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        id: 100,
        identifier: ROOT_UUID,
        name: 'DemoProject',
        structureType: TreeNodeStructureType.Iteration,
        hasChildren: true,
        path: '\\DemoProject\\Iteration',
        children: [
          {
            id: 101,
            identifier: SPRINT_1_UUID,
            name: 'Sprint 1',
            structureType: TreeNodeStructureType.Iteration,
            hasChildren: false,
            path: '\\DemoProject\\Iteration\\Sprint 1',
            attributes: {
              startDate: new Date('2026-10-01T00:00:00.000Z'),
              finishDate: new Date('2026-10-14T00:00:00.000Z'),
            },
          },
          {
            id: 102,
            identifier: SPRINT_2_UUID,
            name: 'Sprint 2',
            structureType: 'iteration',
            hasChildren: false,
            path: '\\DemoProject\\Iteration\\Sprint 2',
            attributes: {
              startDate: '2026-11-15T00:00:00Z',
              finishDate: '2026-11-30T00:00:00Z',
            },
          },
        ],
      }),
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getClassificationNode: mockGetClassificationNode,
        }),
      ),
    } as unknown as WebApi;

    const result = await listIterations(mockConnection, {
      projectId: 'DemoProject',
    });

    assert.strictEqual(mockGetClassificationNode.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetClassificationNode.mock.calls[0]?.arguments, [
      'DemoProject',
      TreeStructureGroup.Iterations,
      undefined,
      DEFAULT_ITERATION_DEPTH,
    ]);

    assert.strictEqual(result.id, 100);
    assert.strictEqual(result.identifier, ROOT_UUID);
    assert.strictEqual(result.name, 'DemoProject');
    assert.strictEqual(result.structureType, 'iteration');
    assert.strictEqual(result.hasChildren, true);
    assert.strictEqual(result.children?.length, 2);

    assert.deepStrictEqual(result.children?.[0], {
      id: 101,
      identifier: SPRINT_1_UUID,
      name: 'Sprint 1',
      structureType: 'iteration',
      path: '\\DemoProject\\Iteration\\Sprint 1',
      hasChildren: false,
      attributes: {
        startDate: '2026-10-01T00:00:00.000Z',
        finishDate: '2026-10-14T00:00:00.000Z',
      },
    });
    assert.deepStrictEqual(result.children?.[1], {
      id: 102,
      identifier: SPRINT_2_UUID,
      name: 'Sprint 2',
      structureType: 'iteration',
      path: '\\DemoProject\\Iteration\\Sprint 2',
      hasChildren: false,
      attributes: {
        startDate: '2026-11-15T00:00:00Z',
        finishDate: '2026-11-30T00:00:00Z',
      },
    });
  });

  void test('normalizes leading/trailing slashes on path and respects explicit depth bounds (0 and 10)', async () => {
    const mockGetClassificationNode = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        id: 100,
        identifier: ROOT_UUID,
        name: 'Release 1',
        hasChildren: false,
      }),
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getClassificationNode: mockGetClassificationNode,
        }),
      ),
    } as unknown as WebApi;

    await listIterations(mockConnection, {
      projectId: 'DemoProject',
      path: '/Release 1\\',
      depth: 0,
    });
    await listIterations(mockConnection, {
      projectId: 'DemoProject',
      path: '   ',
      depth: 10,
    });

    assert.deepStrictEqual(mockGetClassificationNode.mock.calls[0]?.arguments, [
      'DemoProject',
      TreeStructureGroup.Iterations,
      'Release 1',
      0,
    ]);
    assert.deepStrictEqual(mockGetClassificationNode.mock.calls[1]?.arguments, [
      'DemoProject',
      TreeStructureGroup.Iterations,
      undefined,
      10,
    ]);
  });

  void test('rejects negative, out-of-range, or non-integer depth before making any API call', async () => {
    const mockGetWitApi = mock.fn();
    const mockConnection = {
      getWorkItemTrackingApi: mockGetWitApi,
    } as unknown as WebApi;

    for (const invalidDepth of [-1, 11, 2.5, Number.NaN]) {
      await assert.rejects(
        () =>
          listIterations(mockConnection, {
            projectId: 'DemoProject',
            depth: invalidDepth,
          }),
        AzureDevOpsValidationError,
      );
    }

    assert.strictEqual(mockGetWitApi.mock.callCount(), 0);
  });

  void test('throws AzureDevOpsResourceNotFoundError when API returns undefined or 404', async () => {
    const mockEmptyConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getClassificationNode: mock.fn(() => Promise.resolve(undefined)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        listIterations(mockEmptyConnection, {
          projectId: 'DemoProject',
          path: 'MissingNode',
        }),
      AzureDevOpsResourceNotFoundError,
    );

    const notFoundErr = Object.assign(new Error('Not Found'), {
      statusCode: 404,
      result: { message: "Classification node 'MissingNode' not found." },
    });
    const mock404Connection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getClassificationNode: mock.fn(() => Promise.reject(notFoundErr)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        listIterations(mock404Connection, {
          projectId: 'DemoProject',
          path: 'MissingNode',
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsResourceNotFoundError);
        assert.match(err.message, /MissingNode/);
        return true;
      },
    );
  });

  void test('maps 401 and 403 errors to typed AzureDevOpsError subclasses', async () => {
    const authErr = Object.assign(new Error('Unauthorized'), {
      statusCode: 401,
    });
    const permErr = Object.assign(new Error('Forbidden'), { statusCode: 403 });

    const mockAuthConn = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getClassificationNode: mock.fn(() => Promise.reject(authErr)),
        }),
      ),
    } as unknown as WebApi;

    const mockPermConn = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getClassificationNode: mock.fn(() => Promise.reject(permErr)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () => listIterations(mockAuthConn, { projectId: 'DemoProject' }),
      AzureDevOpsAuthenticationError,
    );
    await assert.rejects(
      () => listIterations(mockPermConn, { projectId: 'DemoProject' }),
      AzureDevOpsPermissionError,
    );
  });
});

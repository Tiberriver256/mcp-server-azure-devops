import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { addWorkItemComment } from './feature.ts';
import { AddWorkItemCommentSchema } from '../schemas.ts';
import { workItemsFeature } from '../index.ts';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';

void describe('addWorkItemComment unit', () => {
  void test('posts Markdown comment with ?format=markdown on Services (resourceVersion >= 4)', async () => {
    const mockBeginGetLocation = mock.fn(() =>
      Promise.resolve({
        id: '608aac0a-32e1-4493-a863-b9cf4566d257',
        area: 'wit',
        resourceName: 'comments',
        routeTemplate:
          '{project}/_apis/wit/workItems/{workItemId}/comments/{commentId}',
        resourceVersion: 4,
        maxVersion: '7.2',
        releasedVersion: '0.0',
      }),
    );
    const mockGetVersioningData = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        apiVersion: '7.1-preview.4',
        requestUrl:
          'https://dev.azure.com/org/DemoProject/_apis/wit/workItems/101/comments?format=markdown',
      }),
    );
    const mockCreateRequestOptions = mock.fn((..._args: unknown[]) => ({
      acceptHeader: 'application/json;api-version=7.1-preview.4',
    }));
    const createdComment = {
      id: 42,
      workItemId: 101,
      version: 1,
      text: '**Triage**: verified',
      format: 'markdown',
    };
    const mockRestCreate = mock.fn((..._args: unknown[]) =>
      Promise.resolve({ statusCode: 200, result: createdComment }),
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          vsoClient: {
            beginGetLocation: mockBeginGetLocation,
            getVersioningData: mockGetVersioningData,
          },
          createRequestOptions: mockCreateRequestOptions,
          rest: {
            create: mockRestCreate,
          },
        }),
      ),
    } as unknown as WebApi;

    const result = await addWorkItemComment(mockConnection, {
      workItemId: 101,
      projectId: 'DemoProject',
      text: '**Triage**: verified',
      format: 'markdown',
    });

    assert.deepStrictEqual(result, createdComment);
    assert.strictEqual(mockBeginGetLocation.mock.callCount(), 1);
    assert.deepStrictEqual(mockBeginGetLocation.mock.calls[0]?.arguments, [
      'wit',
      '608aac0a-32e1-4493-a863-b9cf4566d257',
    ]);
    assert.strictEqual(mockGetVersioningData.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetVersioningData.mock.calls[0]?.arguments, [
      '7.1-preview.4',
      'wit',
      '608aac0a-32e1-4493-a863-b9cf4566d257',
      { project: 'DemoProject', workItemId: 101 },
      { format: 'markdown' },
    ]);
    assert.strictEqual(mockRestCreate.mock.callCount(), 1);
    assert.deepStrictEqual(mockRestCreate.mock.calls[0]?.arguments, [
      'https://dev.azure.com/org/DemoProject/_apis/wit/workItems/101/comments?format=markdown',
      { text: '**Triage**: verified' },
      { acceptHeader: 'application/json;api-version=7.1-preview.4' },
    ]);
  });

  void test('omits format query param on Services when format is not provided', async () => {
    const mockGetVersioningData = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        apiVersion: '7.1-preview.4',
        requestUrl:
          'https://dev.azure.com/org/DemoProject/_apis/wit/workItems/101/comments',
      }),
    );
    const mockRestCreate = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        statusCode: 200,
        result: { id: 10, workItemId: 101, text: 'Plain comment' },
      }),
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          vsoClient: {
            beginGetLocation: mock.fn(() =>
              Promise.resolve({ resourceVersion: 4 }),
            ),
            getVersioningData: mockGetVersioningData,
          },
          createRequestOptions: mock.fn(() => ({})),
          rest: { create: mockRestCreate },
        }),
      ),
    } as unknown as WebApi;

    await addWorkItemComment(mockConnection, {
      workItemId: 101,
      projectId: 'DemoProject',
      text: 'Plain comment',
    });

    assert.deepStrictEqual(mockGetVersioningData.mock.calls[0]?.arguments, [
      '7.1-preview.4',
      'wit',
      '608aac0a-32e1-4493-a863-b9cf4566d257',
      { project: 'DemoProject', workItemId: 101 },
      undefined,
    ]);
  });

  void test('omits unsupported format query param on Server 2022/2020 (resourceVersion <= 3)', async () => {
    const mockGetVersioningData = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        apiVersion: '7.0-preview.3',
        requestUrl:
          'https://ado.local/tfs/DefaultCollection/DemoProject/_apis/wit/workItems/101/comments',
      }),
    );
    const mockRestCreate = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        statusCode: 200,
        result: {
          id: 5,
          workItemId: 101,
          text: 'Server 2022 rv3 comment',
          format: 'html',
        },
      }),
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          vsoClient: {
            beginGetLocation: mock.fn(() =>
              Promise.resolve({ resourceVersion: 3, maxVersion: '7.0' }),
            ),
            getVersioningData: mockGetVersioningData,
          },
          createRequestOptions: mock.fn((_type: string, ver: string) => ({
            acceptHeader: `application/json;api-version=${ver}`,
          })),
          rest: { create: mockRestCreate },
        }),
      ),
    } as unknown as WebApi;

    const result = await addWorkItemComment(mockConnection, {
      workItemId: 101,
      projectId: 'DemoProject',
      text: 'Server 2022 rv3 comment',
      format: 'markdown',
    });

    assert.strictEqual(result.text, 'Server 2022 rv3 comment');
    assert.deepStrictEqual(mockGetVersioningData.mock.calls[0]?.arguments, [
      '7.0-preview.3',
      'wit',
      '608aac0a-32e1-4493-a863-b9cf4566d257',
      { project: 'DemoProject', workItemId: 101 },
      undefined,
    ]);
  });

  void test('falls back to PATCH System.History when comments location is missing (Server 2019 RTM)', async () => {
    const mockUpdateWorkItem = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        id: 101,
        rev: 3,
        url: 'https://ado2019.local/tfs/DefaultCollection/DemoProject/_apis/wit/workItems/101',
        fields: {
          'System.History': 'Server 2019 fallback note',
        },
      }),
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          vsoClient: {
            beginGetLocation: mock.fn(() => Promise.resolve(undefined)),
          },
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    const result = await addWorkItemComment(mockConnection, {
      workItemId: 101,
      projectId: 'DemoProject',
      text: 'Server 2019 fallback note',
    });

    assert.deepStrictEqual(result, {
      workItemId: 101,
      text: 'Server 2019 fallback note',
      version: 3,
      url: 'https://ado2019.local/tfs/DefaultCollection/DemoProject/_apis/wit/workItems/101',
      fallback: true,
      fallbackMethod: 'System.History',
    });
    assert.strictEqual(mockUpdateWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockUpdateWorkItem.mock.calls[0]?.arguments, [
      null,
      [
        {
          op: 'add',
          path: '/fields/System.History',
          value: 'Server 2019 fallback note',
        },
      ],
      101,
      'DemoProject',
    ]);
  });

  void test('falls back to PATCH System.History when beginGetLocation throws', async () => {
    const mockUpdateWorkItem = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        id: 101,
        rev: 4,
        url: 'https://ado2019.local/workItems/101',
      }),
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          vsoClient: {
            beginGetLocation: mock.fn(() =>
              Promise.reject(new Error('Location service unavailable')),
            ),
          },
          updateWorkItem: mockUpdateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    const result = await addWorkItemComment(mockConnection, {
      workItemId: 101,
      projectId: 'DemoProject',
      text: 'Fallback on probe error',
    });

    assert.strictEqual('fallback' in result && result.fallback, true);
    assert.strictEqual(result.text, 'Fallback on probe error');
  });

  void test('auto-resolves projectId via getWorkItem when omitted', async () => {
    const mockGetWorkItem = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        fields: { 'System.TeamProject': 'ResolvedProj' },
      }),
    );
    const mockGetVersioningData = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        apiVersion: '7.1-preview.4',
        requestUrl:
          'https://dev.azure.com/org/ResolvedProj/_apis/wit/workItems/101/comments',
      }),
    );
    const mockRestCreate = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        statusCode: 200,
        result: { id: 9, workItemId: 101, text: 'Auto-resolved' },
      }),
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mockGetWorkItem,
          vsoClient: {
            beginGetLocation: mock.fn(() =>
              Promise.resolve({ resourceVersion: 4 }),
            ),
            getVersioningData: mockGetVersioningData,
          },
          createRequestOptions: mock.fn(() => ({})),
          rest: { create: mockRestCreate },
        }),
      ),
    } as unknown as WebApi;

    await addWorkItemComment(mockConnection, {
      workItemId: 101,
      text: 'Auto-resolved',
    });

    assert.strictEqual(mockGetWorkItem.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetWorkItem.mock.calls[0]?.arguments, [
      101,
      ['System.TeamProject'],
    ]);
    assert.deepStrictEqual(mockGetVersioningData.mock.calls[0]?.arguments[3], {
      project: 'ResolvedProj',
      workItemId: 101,
    });
  });

  void test('rejects empty and whitespace-only text without calling Azure DevOps', async () => {
    const mockGetApi = mock.fn();
    const mockConnection = {
      getWorkItemTrackingApi: mockGetApi,
    } as unknown as WebApi;

    for (const invalidText of ['', '   ', '\n\t  ']) {
      await assert.rejects(
        () =>
          addWorkItemComment(mockConnection, {
            workItemId: 101,
            projectId: 'DemoProject',
            text: invalidText,
          }),
        AzureDevOpsValidationError,
      );
    }

    assert.strictEqual(mockGetApi.mock.callCount(), 0);
  });

  void test('maps 404 rest.create response to AzureDevOpsResourceNotFoundError', async () => {
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          vsoClient: {
            beginGetLocation: mock.fn(() =>
              Promise.resolve({ resourceVersion: 4 }),
            ),
            getVersioningData: mock.fn(() =>
              Promise.resolve({
                apiVersion: '7.1-preview.4',
                requestUrl:
                  'https://dev.azure.com/org/DemoProject/_apis/wit/workItems/999999/comments',
              }),
            ),
          },
          createRequestOptions: mock.fn(() => ({})),
          rest: {
            create: mock.fn(() =>
              Promise.resolve({ statusCode: 404, result: null }),
            ),
          },
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        addWorkItemComment(mockConnection, {
          workItemId: 999999,
          projectId: 'DemoProject',
          text: 'Missing work item comment',
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsResourceNotFoundError);
        assert.match(err.message, /999999/);
        return true;
      },
    );
  });

  void test('maps 404 during project resolution to AzureDevOpsResourceNotFoundError', async () => {
    const notFoundErr = Object.assign(new Error('Not found'), {
      statusCode: 404,
    });
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getWorkItem: mock.fn(() => Promise.reject(notFoundErr)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        addWorkItemComment(mockConnection, {
          workItemId: 999999,
          text: 'Comment on missing item',
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void test('wraps unexpected errors in AzureDevOpsError', async () => {
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() => {
        throw new Error('Network failure');
      }),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        addWorkItemComment(mockConnection, {
          workItemId: 101,
          projectId: 'DemoProject',
          text: 'Hello',
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsError);
        assert.strictEqual(
          err.message,
          'Failed to add work item comment: Network failure',
        );
        return true;
      },
    );
  });

  void test('validates schema and registers add_work_item_comment as non-destructive non-idempotent write tool', () => {
    assert.throws(() =>
      AddWorkItemCommentSchema.parse({ workItemId: 101, text: '   ' }),
    );
    assert.throws(() =>
      AddWorkItemCommentSchema.parse({ workItemId: 0, text: 'Valid' }),
    );
    const parsed = AddWorkItemCommentSchema.parse({
      workItemId: 101,
      text: '  Hello  ',
      format: 'markdown',
    });
    assert.strictEqual(parsed.text, 'Hello');

    const tool = workItemsFeature.tools.find(
      (t) => t.name === 'add_work_item_comment',
    );
    assert.ok(tool);
    assert.strictEqual(tool.readOnly, false);
    assert.strictEqual(tool.annotations.readOnlyHint, false);
    assert.strictEqual(tool.annotations.destructiveHint, false);
    assert.strictEqual(tool.annotations.idempotentHint, false);
    const def = tool.toDefinition();
    assert.ok(def.inputSchema && typeof def.inputSchema === 'object');
  });
});

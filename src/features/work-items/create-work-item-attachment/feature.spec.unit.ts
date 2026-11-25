import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { createWorkItemAttachment } from './feature.ts';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';
import { streamToString } from '../../../shared/utils/stream.ts';

void describe('createWorkItemAttachment unit', () => {
  let tempDir: string;
  let sampleFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-attach-upload-'));
    sampleFile = path.join(tempDir, 'notes.txt');
    fs.writeFileSync(sampleFile, 'streaming attachment payload', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  void test('streams file content from disk and attaches relation to work item', async () => {
    let streamedBody = '';
    const createAttachment = mock.fn(
      async (
        _headers: unknown,
        stream: NodeJS.ReadableStream,
        _fileName?: string,
        _uploadType?: string,
        _areaPath?: string,
      ) => {
        streamedBody = await streamToString(stream);
        return { url: 'https://dev.azure.com/org/_apis/wit/attachments/att-1' };
      },
    );
    const updateWorkItem = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        id: 123,
        relations: [{ rel: 'AttachedFile' }],
      }),
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          createAttachment,
          updateWorkItem,
        }),
      ),
    } as unknown as WebApi;

    const result = await createWorkItemAttachment(mockConnection, 123, {
      filePath: sampleFile,
      comment: 'Diagnostic log',
    });

    assert.strictEqual(streamedBody, 'streaming attachment payload');
    assert.strictEqual(createAttachment.mock.callCount(), 1);
    const createArgs = createAttachment.mock.calls[0]?.arguments;
    assert.ok(createArgs);
    assert.strictEqual(createArgs.length, 5);
    assert.deepStrictEqual(createArgs[0], {});
    assert.notStrictEqual(createArgs[1], null);
    assert.notStrictEqual(createArgs[1], undefined);
    assert.strictEqual(
      Object.getPrototypeOf(createArgs[1]),
      fs.ReadStream.prototype,
    );
    assert.strictEqual(createArgs[2], 'notes.txt');
    assert.strictEqual(createArgs[3], undefined);
    assert.strictEqual(createArgs[4], undefined);

    assert.strictEqual(updateWorkItem.mock.callCount(), 1);
    const updateArgs = updateWorkItem.mock.calls[0]?.arguments;
    assert.ok(updateArgs);
    assert.strictEqual(updateArgs.length, 8);
    assert.deepStrictEqual(updateArgs.slice(0, 7), [
      {},
      [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'AttachedFile',
            url: 'https://dev.azure.com/org/_apis/wit/attachments/att-1',
            attributes: {
              name: 'notes.txt',
              comment: 'Diagnostic log',
            },
          },
        },
      ],
      123,
      undefined,
      false,
      false,
      false,
    ]);
    assert.notStrictEqual(updateArgs[7], null);
    assert.notStrictEqual(updateArgs[7], undefined);
    assert.strictEqual(result.id, 123);
  });

  void test('throws when filePath is empty or file does not exist', async () => {
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(),
    } as unknown as WebApi;

    await assert.rejects(
      () => createWorkItemAttachment(mockConnection, 123, { filePath: '' }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('File path is required'));
        return true;
      },
    );

    const missing = path.join(tempDir, 'missing.txt');
    await assert.rejects(
      () =>
        createWorkItemAttachment(mockConnection, 123, { filePath: missing }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes(`File does not exist: ${missing}`));
        return true;
      },
    );
  });

  void test('propagates AzureDevOpsError and wraps unexpected errors', async () => {
    const adoErrConn = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.reject(new AzureDevOpsError('Custom error')),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () => createWorkItemAttachment(adoErrConn, 123, { filePath: sampleFile }),
      AzureDevOpsError,
    );

    const genericErrConn = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.reject(new Error('Unexpected error')),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        createWorkItemAttachment(genericErrConn, 123, { filePath: sampleFile }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Failed to create attachment: Unexpected error',
        );
        return true;
      },
    );
  });
});

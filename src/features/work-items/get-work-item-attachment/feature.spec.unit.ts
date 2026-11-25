import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getWorkItemAttachment } from './feature.ts';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors/index.ts';

void describe('getWorkItemAttachment unit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-attach-download-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  void test('streams attachment bytes to disk, creating missing parent directories', async () => {
    const outPath = path.join(tempDir, 'nested', 'dir', 'report.bin');
    const payload = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getAttachmentContent: mock.fn(() =>
            Promise.resolve(Readable.from([payload])),
          ),
        }),
      ),
    } as unknown as WebApi;

    const result = await getWorkItemAttachment(mockConnection, {
      attachmentId: 'att-42',
      outputPath: outPath,
    });

    assert.deepStrictEqual(result, {
      filePath: outPath,
      fileName: 'report.bin',
      size: payload.length,
    });
    assert.deepStrictEqual(fs.readFileSync(outPath), payload);
  });

  void test('preserves valid small stack-trace and HTML attachments without false-positive deletion', async () => {
    const stackPath = path.join(tempDir, 'stacktrace.txt');
    const stackText =
      'System.NullReferenceException: Object reference not set to an instance of an object.\n  at App.Main()';
    const htmlPath = path.join(tempDir, 'report.html');
    const htmlText =
      '<!DOCTYPE html><html><body><h1>Test Report</h1><p>All tests passed.</p></body></html>';

    const getAttachmentContent = mock.fn<() => Promise<NodeJS.ReadableStream>>(
      () => Promise.reject(new Error('Unexpected getAttachmentContent call')),
    );
    getAttachmentContent.mock.mockImplementationOnce(
      () => Promise.resolve(Readable.from([stackText])),
      0,
    );
    getAttachmentContent.mock.mockImplementationOnce(
      () => Promise.resolve(Readable.from([htmlText])),
      1,
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({ getAttachmentContent }),
      ),
    } as unknown as WebApi;

    const stackRes = await getWorkItemAttachment(mockConnection, {
      attachmentId: 'att-stack',
      outputPath: stackPath,
    });
    assert.strictEqual(stackRes.size, Buffer.byteLength(stackText));
    assert.strictEqual(fs.readFileSync(stackPath, 'utf8'), stackText);

    const htmlRes = await getWorkItemAttachment(mockConnection, {
      attachmentId: 'att-html',
      outputPath: htmlPath,
    });
    assert.strictEqual(htmlRes.size, Buffer.byteLength(htmlText));
    assert.strictEqual(fs.readFileSync(htmlPath, 'utf8'), htmlText);
  });

  void test('unlinks partial file when the download stream fails mid-transfer', async () => {
    const outPath = path.join(tempDir, 'partial.bin');
    const failingStream = new Readable({
      read() {
        this.push(Buffer.from('partial-chunk'));
        this.destroy(new Error('network reset'));
      },
    });

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({
          getAttachmentContent: mock.fn(() => Promise.resolve(failingStream)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getWorkItemAttachment(mockConnection, {
          attachmentId: 'att-broken',
          outputPath: outPath,
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Failed to get attachment: network reset',
        );
        return true;
      },
    );

    assert.strictEqual(fs.existsSync(outPath), false);
  });

  void test('detects genuine ADO JSON error envelopes and ADO sign-in HTML, unlinking and throwing AzureDevOpsResourceNotFoundError', async () => {
    const jsonErrPath = path.join(tempDir, 'not-found.json');
    const adoJsonError = JSON.stringify({
      $id: '1',
      innerException: null,
      message: 'TF401232: Attachment does not exist.',
      typeKey: 'AttachmentNotFoundException',
      errorCode: 0,
    });
    const signInPath = path.join(tempDir, 'signin.html');
    const adoSignInHtml =
      '<!DOCTYPE html><html><head><title>Azure DevOps Services | Sign In</title></head><body>Sign in</body></html>';

    const getAttachmentContent = mock.fn<() => Promise<NodeJS.ReadableStream>>(
      () => Promise.reject(new Error('Unexpected getAttachmentContent call')),
    );
    getAttachmentContent.mock.mockImplementationOnce(
      () => Promise.resolve(Readable.from([adoJsonError])),
      0,
    );
    getAttachmentContent.mock.mockImplementationOnce(
      () => Promise.resolve(Readable.from([adoSignInHtml])),
      1,
    );

    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.resolve({ getAttachmentContent }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getWorkItemAttachment(mockConnection, {
          attachmentId: 'missing-id',
          outputPath: jsonErrPath,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsResourceNotFoundError);
        assert.strictEqual(err.message, 'Attachment not found (missing-id)');
        return true;
      },
    );
    assert.strictEqual(fs.existsSync(jsonErrPath), false);

    await assert.rejects(
      () =>
        getWorkItemAttachment(mockConnection, {
          attachmentId: 'signin-id',
          outputPath: signInPath,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsResourceNotFoundError);
        assert.strictEqual(err.message, 'Attachment not found (signin-id)');
        return true;
      },
    );
    assert.strictEqual(fs.existsSync(signInPath), false);
  });

  void test('validates required inputs and propagates AzureDevOpsError', async () => {
    const mockConnection = {
      getWorkItemTrackingApi: mock.fn(() =>
        Promise.reject(new AzureDevOpsError('Custom error')),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getWorkItemAttachment(mockConnection, {
          attachmentId: '',
          outputPath: path.join(tempDir, 'a.txt'),
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Attachment ID is required/);
        return true;
      },
    );

    await assert.rejects(
      () =>
        getWorkItemAttachment(mockConnection, {
          attachmentId: 'abc',
          outputPath: '',
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Output path is required/);
        return true;
      },
    );

    await assert.rejects(
      () =>
        getWorkItemAttachment(mockConnection, {
          attachmentId: 'abc',
          outputPath: path.join(tempDir, 'a.txt'),
        }),
      AzureDevOpsError,
    );
  });
});

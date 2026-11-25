import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import type { WebApi } from 'azure-devops-node-api';
import { getWorkItemAttachment } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

describe('getWorkItemAttachment unit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-attach-download-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('streams attachment bytes to disk, creating missing parent directories', async () => {
    const outPath = path.join(tempDir, 'nested', 'dir', 'report.bin');
    const payload = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);

    const mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getAttachmentContent: jest
          .fn()
          .mockResolvedValue(Readable.from([payload])),
      }),
    } as unknown as WebApi;

    const result = await getWorkItemAttachment(mockConnection, {
      attachmentId: 'att-42',
      outputPath: outPath,
    });

    expect(result).toEqual({
      filePath: outPath,
      fileName: 'report.bin',
      size: payload.length,
    });
    expect(fs.readFileSync(outPath)).toEqual(payload);
  });

  test('preserves valid small stack-trace and HTML attachments without false-positive deletion', async () => {
    const stackPath = path.join(tempDir, 'stacktrace.txt');
    const stackText =
      'System.NullReferenceException: Object reference not set to an instance of an object.\n  at App.Main()';
    const htmlPath = path.join(tempDir, 'report.html');
    const htmlText =
      '<!DOCTYPE html><html><body><h1>Test Report</h1><p>All tests passed.</p></body></html>';

    const mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getAttachmentContent: jest
          .fn()
          .mockResolvedValueOnce(Readable.from([stackText]))
          .mockResolvedValueOnce(Readable.from([htmlText])),
      }),
    } as unknown as WebApi;

    const stackRes = await getWorkItemAttachment(mockConnection, {
      attachmentId: 'att-stack',
      outputPath: stackPath,
    });
    expect(stackRes.size).toBe(Buffer.byteLength(stackText));
    expect(fs.readFileSync(stackPath, 'utf8')).toBe(stackText);

    const htmlRes = await getWorkItemAttachment(mockConnection, {
      attachmentId: 'att-html',
      outputPath: htmlPath,
    });
    expect(htmlRes.size).toBe(Buffer.byteLength(htmlText));
    expect(fs.readFileSync(htmlPath, 'utf8')).toBe(htmlText);
  });

  test('unlinks partial file when the download stream fails mid-transfer', async () => {
    const outPath = path.join(tempDir, 'partial.bin');
    const failingStream = new Readable({
      read() {
        this.push(Buffer.from('partial-chunk'));
        this.destroy(new Error('network reset'));
      },
    });

    const mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getAttachmentContent: jest.fn().mockResolvedValue(failingStream),
      }),
    } as unknown as WebApi;

    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'att-broken',
        outputPath: outPath,
      }),
    ).rejects.toThrow('Failed to get attachment: network reset');

    expect(fs.existsSync(outPath)).toBe(false);
  });

  test('detects genuine ADO JSON error envelopes and ADO sign-in HTML, unlinking and throwing AzureDevOpsResourceNotFoundError', async () => {
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

    const mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getAttachmentContent: jest
          .fn()
          .mockResolvedValueOnce(Readable.from([adoJsonError]))
          .mockResolvedValueOnce(Readable.from([adoSignInHtml])),
      }),
    } as unknown as WebApi;

    const err1 = await getWorkItemAttachment(mockConnection, {
      attachmentId: 'missing-id',
      outputPath: jsonErrPath,
    }).catch((e: unknown) => e);
    expect(err1).toBeInstanceOf(AzureDevOpsResourceNotFoundError);
    expect((err1 as Error).message).toBe('Attachment not found (missing-id)');
    expect(fs.existsSync(jsonErrPath)).toBe(false);

    const err2 = await getWorkItemAttachment(mockConnection, {
      attachmentId: 'signin-id',
      outputPath: signInPath,
    }).catch((e: unknown) => e);
    expect(err2).toBeInstanceOf(AzureDevOpsResourceNotFoundError);
    expect((err2 as Error).message).toBe('Attachment not found (signin-id)');
    expect(fs.existsSync(signInPath)).toBe(false);
  });

  test('validates required inputs and propagates AzureDevOpsError', async () => {
    const mockConnection = {
      getWorkItemTrackingApi: jest
        .fn()
        .mockRejectedValue(new AzureDevOpsError('Custom error')),
    } as unknown as WebApi;

    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: '',
        outputPath: path.join(tempDir, 'a.txt'),
      }),
    ).rejects.toThrow('Attachment ID is required');

    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'abc',
        outputPath: '',
      }),
    ).rejects.toThrow('Output path is required');

    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'abc',
        outputPath: path.join(tempDir, 'a.txt'),
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });
});

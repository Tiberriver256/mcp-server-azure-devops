import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import type { WebApi } from 'azure-devops-node-api';
import { getWorkItemAttachment } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

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

  test('detects HTML/JSON error body responses and deletes the downloaded error page', async () => {
    const outPath = path.join(tempDir, 'not-found.txt');
    const errorPage =
      '<!DOCTYPE html><html><body>Attachment does not exist</body></html>';

    const mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getAttachmentContent: jest
          .fn()
          .mockResolvedValue(Readable.from([errorPage])),
      }),
    } as unknown as WebApi;

    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'missing-id',
        outputPath: outPath,
      }),
    ).rejects.toThrow('Attachment not found (missing-id)');

    expect(fs.existsSync(outPath)).toBe(false);
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

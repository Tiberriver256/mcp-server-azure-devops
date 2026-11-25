import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { WebApi } from 'azure-devops-node-api';
import { createWorkItemAttachment } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';
import { streamToString } from '../../../shared/utils/stream';

describe('createWorkItemAttachment unit', () => {
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

  test('streams file content from disk and attaches relation to work item', async () => {
    let streamedBody = '';
    const createAttachment = jest.fn(
      async (_headers: unknown, stream: NodeJS.ReadableStream) => {
        streamedBody = await streamToString(stream);
        return { url: 'https://dev.azure.com/org/_apis/wit/attachments/att-1' };
      },
    );
    const updateWorkItem = jest.fn().mockResolvedValue({
      id: 123,
      relations: [{ rel: 'AttachedFile' }],
    });

    const mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createAttachment,
        updateWorkItem,
      }),
    } as unknown as WebApi;

    const result = await createWorkItemAttachment(mockConnection, 123, {
      filePath: sampleFile,
      comment: 'Diagnostic log',
    });

    expect(streamedBody).toBe('streaming attachment payload');
    expect(createAttachment).toHaveBeenCalledWith(
      {},
      expect.any(fs.ReadStream),
      'notes.txt',
      undefined,
      undefined,
    );
    expect(updateWorkItem).toHaveBeenCalledWith(
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
      expect.anything(),
    );
    expect(result.id).toBe(123);
  });

  test('throws when filePath is empty or file does not exist', async () => {
    const mockConnection = {
      getWorkItemTrackingApi: jest.fn(),
    } as unknown as WebApi;

    await expect(
      createWorkItemAttachment(mockConnection, 123, { filePath: '' }),
    ).rejects.toThrow('File path is required');

    const missing = path.join(tempDir, 'missing.txt');
    await expect(
      createWorkItemAttachment(mockConnection, 123, { filePath: missing }),
    ).rejects.toThrow(`File does not exist: ${missing}`);
  });

  test('propagates AzureDevOpsError and wraps unexpected errors', async () => {
    const adoErrConn = {
      getWorkItemTrackingApi: jest
        .fn()
        .mockRejectedValue(new AzureDevOpsError('Custom error')),
    } as unknown as WebApi;

    await expect(
      createWorkItemAttachment(adoErrConn, 123, { filePath: sampleFile }),
    ).rejects.toThrow(AzureDevOpsError);

    const genericErrConn = {
      getWorkItemTrackingApi: jest
        .fn()
        .mockRejectedValue(new Error('Unexpected error')),
    } as unknown as WebApi;

    await expect(
      createWorkItemAttachment(genericErrConn, 123, { filePath: sampleFile }),
    ).rejects.toThrow('Failed to create attachment: Unexpected error');
  });
});

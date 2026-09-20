import { WebApi } from 'azure-devops-node-api';
import { getWorkItemAttachment } from './feature';
import { createWorkItemAttachment } from '../create-work-item-attachment/feature';
import { createWorkItem } from '../create-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../__test__/test-helpers';
import {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
  GetWorkItemAttachmentOptions,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('getWorkItemAttachment integration', () => {
  let connection: WebApi;
  let createdWorkItemId: number;
  let uploadedAttachmentId: string;
  let testFilePath: string;
  let downloadPath: string;
  const testFileContent =
    'This is test content for download integration tests.';

  beforeAll(async () => {
    const testConnection = await getTestConnection();
    if (!testConnection) {
      throw new Error(
        'Connection should be available when integration tests are enabled',
      );
    }
    connection = testConnection;

    const projectName =
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    const uniqueTitle = `Download Attachment Test Work Item ${new Date().toISOString()}`;

    const createOptions: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'Work item for download attachment integration tests',
    };

    const workItem = await createWorkItem(
      connection,
      projectName,
      'Task',
      createOptions,
    );
    if (!workItem?.id) {
      throw new Error('Failed to create work item for download tests');
    }
    createdWorkItemId = workItem.id;

    const tempDir = os.tmpdir();
    testFilePath = path.join(tempDir, `test-download-${Date.now()}.txt`);
    fs.writeFileSync(testFilePath, testFileContent);

    const uploadOptions: CreateWorkItemAttachmentOptions = {
      filePath: testFilePath,
      fileName: 'test-download-file.txt',
    };

    const updatedWorkItem = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      uploadOptions,
    );

    const attachmentRelation = updatedWorkItem.relations?.find(
      (r) => r.rel === 'AttachedFile',
    );
    if (!attachmentRelation?.url) {
      throw new Error('Failed to upload attachment for download tests');
    }
    const urlParts = attachmentRelation.url.split('/');
    uploadedAttachmentId = urlParts[urlParts.length - 1];

    downloadPath = path.join(tempDir, `downloaded-${Date.now()}.txt`);
  });

  afterAll(() => {
    if (testFilePath && fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    if (downloadPath && fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath);
    }
  });

  test('should download an attachment from Azure DevOps', async () => {
    const options: GetWorkItemAttachmentOptions = {
      attachmentId: uploadedAttachmentId,
      outputPath: downloadPath,
    };

    const result = await getWorkItemAttachment(connection, options);

    expect(result).toBeDefined();
    expect(result.filePath).toBe(downloadPath);
    expect(result.size).toBeGreaterThan(0);
    expect(fs.existsSync(downloadPath)).toBe(true);

    const downloadedContent = fs.readFileSync(downloadPath, 'utf-8');
    expect(downloadedContent).toBe(testFileContent);
  });

  test('should reject or surface an error for a non-existent attachment', async () => {
    // Azure DevOps often returns an HTML/JSON error body for invalid GUIDs
    // instead of a hard HTTP failure. Accept either a thrown error or a
    // written error payload that is not valid attachment content.
    const tempDir = os.tmpdir();
    const nonExistentDownloadPath = path.join(
      tempDir,
      `nonexistent-${Date.now()}.txt`,
    );

    const options: GetWorkItemAttachmentOptions = {
      attachmentId: '00000000-0000-0000-0000-000000000000',
      outputPath: nonExistentDownloadPath,
    };

    let threw = false;
    try {
      await getWorkItemAttachment(connection, options);
    } catch (error) {
      threw = true;
      expect(String(error)).toMatch(/Failed to get attachment|not found|404/i);
    }

    if (!threw) {
      expect(fs.existsSync(nonExistentDownloadPath)).toBe(true);
      const body = fs
        .readFileSync(nonExistentDownloadPath, 'utf-8')
        .toLowerCase();
      expect(
        body.includes('<html') ||
          body.includes('<!doctype') ||
          body.includes('exception') ||
          body.includes('not found') ||
          body.includes('tf401232'),
      ).toBe(true);
    }

    if (fs.existsSync(nonExistentDownloadPath)) {
      fs.unlinkSync(nonExistentDownloadPath);
    }
  });
});

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getWorkItemAttachment } from './feature.ts';
import { createWorkItemAttachment } from '../create-work-item-attachment/feature.ts';
import { createWorkItem } from '../create-work-item/feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import type {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
  GetWorkItemAttachmentOptions,
} from '../types.ts';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getWorkItemAttachment integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let createdWorkItemId: number;
    let uploadedAttachmentId: string;
    let testFilePath: string;
    let downloadPath: string;
    const testFileContent =
      'This is test content for download integration tests.';

    before(async () => {
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

    after(() => {
      if (testFilePath && fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
      if (downloadPath && fs.existsSync(downloadPath)) {
        fs.unlinkSync(downloadPath);
      }
    });

    void test('should download an attachment from Azure DevOps', async () => {
      const options: GetWorkItemAttachmentOptions = {
        attachmentId: uploadedAttachmentId,
        outputPath: downloadPath,
      };

      const result = await getWorkItemAttachment(connection, options);

      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.filePath, downloadPath);
      assert.ok(result.size > 0);
      assert.strictEqual(fs.existsSync(downloadPath), true);

      const downloadedContent = fs.readFileSync(downloadPath, 'utf-8');
      assert.strictEqual(downloadedContent, testFileContent);
    });

    void test('should reject or surface an error for a non-existent attachment', async () => {
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

      try {
        let threw = false;
        try {
          await getWorkItemAttachment(connection, options);
        } catch (error) {
          threw = true;
          assert.match(
            String(error),
            /Failed to get attachment|not found|404/i,
          );
        }

        if (!threw) {
          assert.strictEqual(fs.existsSync(nonExistentDownloadPath), true);
          const body = fs
            .readFileSync(nonExistentDownloadPath, 'utf-8')
            .toLowerCase();
          assert.strictEqual(
            body.includes('<html') ||
              body.includes('<!doctype') ||
              body.includes('exception') ||
              body.includes('not found') ||
              body.includes('tf401232'),
            true,
          );
        }
      } finally {
        if (fs.existsSync(nonExistentDownloadPath)) {
          fs.unlinkSync(nonExistentDownloadPath);
        }
      }
    });
  },
);

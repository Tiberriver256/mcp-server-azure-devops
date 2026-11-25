import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { deleteWorkItemAttachment } from './feature.ts';
import { createWorkItemAttachment } from '../create-work-item-attachment/feature.ts';
import { createWorkItem } from '../create-work-item/feature.ts';
import { getWorkItem } from '../get-work-item/feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import type {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
  DeleteWorkItemAttachmentOptions,
} from '../types.ts';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'deleteWorkItemAttachment integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let createdWorkItemId: number;
    let uploadedAttachmentId: string;
    let testFilePath: string;

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
      const uniqueTitle = `Delete Attachment Test Work Item ${new Date().toISOString()}`;

      const createOptions: CreateWorkItemOptions = {
        title: uniqueTitle,
        description: 'Work item for delete attachment integration tests',
      };

      const workItem = await createWorkItem(
        connection,
        projectName,
        'Task',
        createOptions,
      );
      if (!workItem?.id) {
        throw new Error('Failed to create work item for delete tests');
      }
      createdWorkItemId = workItem.id;

      const tempDir = os.tmpdir();
      testFilePath = path.join(tempDir, `test-delete-${Date.now()}.txt`);
      fs.writeFileSync(
        testFilePath,
        'This is test content for delete integration tests.',
      );

      const uploadOptions: CreateWorkItemAttachmentOptions = {
        filePath: testFilePath,
        fileName: 'test-delete-file.txt',
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
        throw new Error('Failed to upload attachment for delete tests');
      }
      const urlParts = attachmentRelation.url.split('/');
      uploadedAttachmentId = urlParts[urlParts.length - 1];
    });

    after(() => {
      if (testFilePath && fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    });

    void test('should delete an attachment from a work item', async () => {
      const options: DeleteWorkItemAttachmentOptions = {
        workItemId: createdWorkItemId,
        attachmentId: uploadedAttachmentId,
      };

      const result = await deleteWorkItemAttachment(connection, options);

      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.id, createdWorkItemId);

      const updatedWorkItem = await getWorkItem(
        connection,
        createdWorkItemId,
        'relations',
      );
      const attachmentRelation = updatedWorkItem.relations?.find(
        (r) =>
          r.rel === 'AttachedFile' && r.url?.includes(uploadedAttachmentId),
      );
      assert.strictEqual(attachmentRelation, undefined);
    });

    void test('should throw error when attachment does not exist on work item', async () => {
      const options: DeleteWorkItemAttachmentOptions = {
        workItemId: createdWorkItemId,
        attachmentId: '00000000-0000-0000-0000-000000000000',
      };

      await assert.rejects(
        () => deleteWorkItemAttachment(connection, options),
        /Failed to delete attachment|not found|does not exist/i,
      );
    });
  },
);

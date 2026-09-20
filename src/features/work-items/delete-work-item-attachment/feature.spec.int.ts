import { WebApi } from 'azure-devops-node-api';
import { deleteWorkItemAttachment } from './feature';
import { createWorkItemAttachment } from '../create-work-item-attachment/feature';
import { createWorkItem } from '../create-work-item/feature';
import { getWorkItem } from '../get-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../__test__/test-helpers';
import {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
  DeleteWorkItemAttachmentOptions,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('deleteWorkItemAttachment integration', () => {
  let connection: WebApi;
  let createdWorkItemId: number;
  let uploadedAttachmentId: string;
  let testFilePath: string;

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

  afterAll(() => {
    if (testFilePath && fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  test('should delete an attachment from a work item', async () => {
    const options: DeleteWorkItemAttachmentOptions = {
      workItemId: createdWorkItemId,
      attachmentId: uploadedAttachmentId,
    };

    const result = await deleteWorkItemAttachment(connection, options);

    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    const updatedWorkItem = await getWorkItem(
      connection,
      createdWorkItemId,
      'relations',
    );
    const attachmentRelation = updatedWorkItem.relations?.find(
      (r) =>
        r.rel === 'AttachedFile' && r.url?.includes(uploadedAttachmentId),
    );
    expect(attachmentRelation).toBeUndefined();
  });

  test('should throw error when attachment does not exist on work item', async () => {
    const options: DeleteWorkItemAttachmentOptions = {
      workItemId: createdWorkItemId,
      attachmentId: '00000000-0000-0000-0000-000000000000',
    };

    await expect(deleteWorkItemAttachment(connection, options)).rejects.toThrow(
      /Failed to delete attachment|not found|does not exist/i,
    );
  });
});

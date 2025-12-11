import { WebApi } from 'azure-devops-node-api';
import { deleteWorkItemAttachment } from './feature';
import { createWorkItemAttachment } from '../create-work-item-attachment/feature';
import { createWorkItem } from '../create-work-item/feature';
import { getWorkItem } from '../get-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
  DeleteWorkItemAttachmentOptions,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('deleteWorkItemAttachment integration', () => {
  let connection: WebApi | null = null;
  let createdWorkItemId: number | null = null;
  let uploadedAttachmentId: string | null = null;
  let testFilePath: string | null = null;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();

    // Skip setup if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      return;
    }

    // Create a work item to be used by the attachment tests
    const projectName =
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    const uniqueTitle = `Delete Attachment Test Work Item ${new Date().toISOString()}`;

    const createOptions: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'Work item for delete attachment integration tests',
    };

    try {
      const workItem = await createWorkItem(
        connection,
        projectName,
        'Task',
        createOptions,
      );
      if (workItem && workItem.id !== undefined) {
        createdWorkItemId = workItem.id;
      }
    } catch (error) {
      console.error('Failed to create work item for delete tests:', error);
      return;
    }

    // Create a temporary test file and upload it
    const tempDir = os.tmpdir();
    testFilePath = path.join(tempDir, `test-delete-${Date.now()}.txt`);
    fs.writeFileSync(
      testFilePath,
      'This is test content for delete integration tests.',
    );

    // Upload an attachment to the work item
    const uploadOptions: CreateWorkItemAttachmentOptions = {
      filePath: testFilePath,
      fileName: 'test-delete-file.txt',
    };

    try {
      const updatedWorkItem = await createWorkItemAttachment(
        connection,
        createdWorkItemId!,
        uploadOptions,
      );

      // Find the attachment ID from the relations
      const attachmentRelation = updatedWorkItem.relations?.find(
        (r) => r.rel === 'AttachedFile',
      );
      if (attachmentRelation && attachmentRelation.url) {
        // Extract attachment ID from URL (last segment)
        const urlParts = attachmentRelation.url.split('/');
        uploadedAttachmentId = urlParts[urlParts.length - 1];
      }
    } catch (error) {
      console.error('Failed to upload attachment for delete tests:', error);
    }
  });

  afterAll(() => {
    // Clean up the temporary test file
    if (testFilePath && fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  test('should delete an attachment from a work item', async () => {
    // Skip if no connection is available or prerequisites not met
    if (
      shouldSkipIntegrationTest() ||
      !connection ||
      !createdWorkItemId ||
      !uploadedAttachmentId
    ) {
      return;
    }

    const options: DeleteWorkItemAttachmentOptions = {
      workItemId: createdWorkItemId,
      attachmentId: uploadedAttachmentId,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await deleteWorkItemAttachment(connection, options);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    // Verify the attachment was removed by fetching the work item
    const updatedWorkItem = await getWorkItem(
      connection,
      createdWorkItemId,
      'relations',
    );
    const attachmentRelation = updatedWorkItem.relations?.find(
      (r) => r.rel === 'AttachedFile' && r.url?.includes(uploadedAttachmentId!),
    );
    expect(attachmentRelation).toBeUndefined();
  });

  test('should throw error when attachment does not exist on work item', async () => {
    // Skip if no connection is available or if work item wasn't created
    if (shouldSkipIntegrationTest() || !connection || !createdWorkItemId) {
      return;
    }

    const options: DeleteWorkItemAttachmentOptions = {
      workItemId: createdWorkItemId,
      attachmentId: '00000000-0000-0000-0000-000000000000', // Non-existent GUID
    };

    // Act & Assert - should throw an error for non-existent attachment
    await expect(deleteWorkItemAttachment(connection, options)).rejects.toThrow(
      /Failed to delete attachment|not found|does not exist/i,
    );
  });
});

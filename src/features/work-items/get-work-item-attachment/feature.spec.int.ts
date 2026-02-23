import { WebApi } from 'azure-devops-node-api';
import { getWorkItemAttachment } from './feature';
import { createWorkItemAttachment } from '../create-work-item-attachment/feature';
import { createWorkItem } from '../create-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
  GetWorkItemAttachmentOptions,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('getWorkItemAttachment integration', () => {
  let connection: WebApi | null = null;
  let createdWorkItemId: number | null = null;
  let uploadedAttachmentId: string | null = null;
  let testFilePath: string | null = null;
  let downloadPath: string | null = null;
  const testFileContent =
    'This is test content for download integration tests.';

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
    const uniqueTitle = `Download Attachment Test Work Item ${new Date().toISOString()}`;

    const createOptions: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'Work item for download attachment integration tests',
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
      console.error('Failed to create work item for download tests:', error);
      return;
    }

    // Create a temporary test file and upload it
    const tempDir = os.tmpdir();
    testFilePath = path.join(tempDir, `test-download-${Date.now()}.txt`);
    fs.writeFileSync(testFilePath, testFileContent);

    // Upload an attachment to the work item
    const uploadOptions: CreateWorkItemAttachmentOptions = {
      filePath: testFilePath,
      fileName: 'test-download-file.txt',
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
      console.error('Failed to upload attachment for download tests:', error);
    }

    // Set up download path
    downloadPath = path.join(tempDir, `downloaded-${Date.now()}.txt`);
  });

  afterAll(() => {
    // Clean up the temporary test files
    if (testFilePath && fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    if (downloadPath && fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath);
    }
  });

  test('should download an attachment from Azure DevOps', async () => {
    // Skip if no connection is available or prerequisites not met
    if (
      shouldSkipIntegrationTest() ||
      !connection ||
      !createdWorkItemId ||
      !uploadedAttachmentId ||
      !downloadPath
    ) {
      return;
    }

    const options: GetWorkItemAttachmentOptions = {
      attachmentId: uploadedAttachmentId,
      outputPath: downloadPath,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await getWorkItemAttachment(connection, options);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.filePath).toBe(downloadPath);
    expect(result.size).toBeGreaterThan(0);

    // Verify the file was downloaded
    expect(fs.existsSync(downloadPath)).toBe(true);

    // Verify the content matches
    const downloadedContent = fs.readFileSync(downloadPath, 'utf-8');
    expect(downloadedContent).toBe(testFileContent);
  });

  test('should throw error when attachment does not exist', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest() || !connection) {
      return;
    }

    const tempDir = os.tmpdir();
    const nonExistentDownloadPath = path.join(
      tempDir,
      `nonexistent-${Date.now()}.txt`,
    );

    const options: GetWorkItemAttachmentOptions = {
      attachmentId: '00000000-0000-0000-0000-000000000000', // Non-existent GUID
      outputPath: nonExistentDownloadPath,
    };

    // Act & Assert - should throw an error for non-existent attachment
    await expect(getWorkItemAttachment(connection, options)).rejects.toThrow(
      /Failed to get attachment|not found|404/i,
    );

    // Clean up if file was somehow created
    if (fs.existsSync(nonExistentDownloadPath)) {
      fs.unlinkSync(nonExistentDownloadPath);
    }
  });
});

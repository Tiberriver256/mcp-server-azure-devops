import { WebApi } from 'azure-devops-node-api';
import { createWorkItemAttachment } from './feature';
import { createWorkItem } from '../create-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('createWorkItemAttachment integration', () => {
  let connection: WebApi | null = null;
  let createdWorkItemId: number | null = null;
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
    const uniqueTitle = `Attachment Test Work Item ${new Date().toISOString()}`;

    const options: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'Work item for attachment integration tests',
    };

    try {
      const workItem = await createWorkItem(
        connection,
        projectName,
        'Task',
        options,
      );
      if (workItem && workItem.id !== undefined) {
        createdWorkItemId = workItem.id;
      }
    } catch (error) {
      console.error('Failed to create work item for attachment tests:', error);
    }

    // Create a temporary test file
    const tempDir = os.tmpdir();
    testFilePath = path.join(tempDir, `test-attachment-${Date.now()}.txt`);
    fs.writeFileSync(
      testFilePath,
      'This is a test file for attachment integration tests.',
    );
  });

  afterAll(() => {
    // Clean up the temporary test file
    if (testFilePath && fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  test('should add an attachment to a work item', async () => {
    // Skip if no connection is available or if work item wasn't created
    if (
      shouldSkipIntegrationTest() ||
      !connection ||
      !createdWorkItemId ||
      !testFilePath
    ) {
      return;
    }

    const options: CreateWorkItemAttachmentOptions = {
      filePath: testFilePath,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      options,
    );

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    // Verify the attachment was added
    expect(result.relations).toBeDefined();
    const attachmentRelation = result.relations?.find(
      (relation) => relation.rel === 'AttachedFile',
    );
    expect(attachmentRelation).toBeDefined();
  });

  test('should add an attachment with a custom file name', async () => {
    // Skip if no connection is available or if work item wasn't created
    if (
      shouldSkipIntegrationTest() ||
      !connection ||
      !createdWorkItemId ||
      !testFilePath
    ) {
      return;
    }

    const customFileName = `custom-name-${Date.now()}.txt`;
    const options: CreateWorkItemAttachmentOptions = {
      filePath: testFilePath,
      fileName: customFileName,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      options,
    );

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    // Verify the attachment was added with the custom name
    expect(result.relations).toBeDefined();
    const attachmentRelation = result.relations?.find(
      (relation) =>
        relation.rel === 'AttachedFile' &&
        relation.attributes?.name === customFileName,
    );
    expect(attachmentRelation).toBeDefined();
  });

  test('should add an attachment with a comment', async () => {
    // Skip if no connection is available or if work item wasn't created
    if (
      shouldSkipIntegrationTest() ||
      !connection ||
      !createdWorkItemId ||
      !testFilePath
    ) {
      return;
    }

    const comment = 'Test attachment comment';
    const options: CreateWorkItemAttachmentOptions = {
      filePath: testFilePath,
      comment: comment,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      options,
    );

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    // Verify the attachment was added with the comment
    expect(result.relations).toBeDefined();
    const attachmentRelation = result.relations?.find(
      (relation) =>
        relation.rel === 'AttachedFile' &&
        relation.attributes?.comment === comment,
    );
    expect(attachmentRelation).toBeDefined();
  });

  test('should throw error when file does not exist', async () => {
    // Skip if no connection is available or if work item wasn't created
    if (shouldSkipIntegrationTest() || !connection || !createdWorkItemId) {
      return;
    }

    const options: CreateWorkItemAttachmentOptions = {
      filePath: '/path/to/nonexistent/file.txt',
    };

    // Act & Assert - should throw an error for non-existent file
    await expect(
      createWorkItemAttachment(connection, createdWorkItemId, options),
    ).rejects.toThrow(/Failed to create attachment|ENOENT|does not exist/);
  });
});

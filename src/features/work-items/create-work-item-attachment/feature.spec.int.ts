import { WebApi } from 'azure-devops-node-api';
import { createWorkItemAttachment } from './feature';
import { createWorkItem } from '../create-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../__test__/test-helpers';
import {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('createWorkItemAttachment integration', () => {
  let connection: WebApi;
  let createdWorkItemId: number;
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
    const uniqueTitle = `Attachment Test Work Item ${new Date().toISOString()}`;

    const options: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'Work item for attachment integration tests',
    };

    const workItem = await createWorkItem(
      connection,
      projectName,
      'Task',
      options,
    );
    if (!workItem?.id) {
      throw new Error('Failed to create work item for attachment tests');
    }
    createdWorkItemId = workItem.id;

    const tempDir = os.tmpdir();
    testFilePath = path.join(tempDir, `test-attachment-${Date.now()}.txt`);
    fs.writeFileSync(
      testFilePath,
      'This is a test file for attachment integration tests.',
    );
  });

  afterAll(() => {
    if (testFilePath && fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  test('should add an attachment to a work item', async () => {
    const options: CreateWorkItemAttachmentOptions = {
      filePath: testFilePath,
    };

    const result = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      options,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);
    expect(result.relations).toBeDefined();
    const attachmentRelation = result.relations?.find(
      (relation) => relation.rel === 'AttachedFile',
    );
    expect(attachmentRelation).toBeDefined();
  });

  test('should add an attachment with a custom file name', async () => {
    const customFileName = `custom-name-${Date.now()}.txt`;
    const options: CreateWorkItemAttachmentOptions = {
      filePath: testFilePath,
      fileName: customFileName,
    };

    const result = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      options,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);
    expect(result.relations).toBeDefined();
    const attachmentRelation = result.relations?.find(
      (relation) =>
        relation.rel === 'AttachedFile' &&
        relation.attributes?.name === customFileName,
    );
    expect(attachmentRelation).toBeDefined();
  });

  test('should add an attachment with a comment', async () => {
    const comment = 'Test attachment comment';
    const options: CreateWorkItemAttachmentOptions = {
      filePath: testFilePath,
      comment: comment,
    };

    const result = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      options,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);
    expect(result.relations).toBeDefined();
    const attachmentRelation = result.relations?.find(
      (relation) =>
        relation.rel === 'AttachedFile' &&
        relation.attributes?.comment === comment,
    );
    expect(attachmentRelation).toBeDefined();
  });

  test('should throw error when file does not exist', async () => {
    const options: CreateWorkItemAttachmentOptions = {
      filePath: '/path/to/nonexistent/file.txt',
    };

    await expect(
      createWorkItemAttachment(connection, createdWorkItemId, options),
    ).rejects.toThrow(/Failed to create attachment|ENOENT|does not exist/);
  });
});

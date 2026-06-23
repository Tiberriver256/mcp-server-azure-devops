import { WebApi } from 'azure-devops-node-api';
import { getWorkItemComments } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../__test__/test-helpers';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors';
import { createWorkItem } from '../create-work-item/feature';
import { CreateWorkItemOptions } from '../types';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('getWorkItemComments integration', () => {
  let connection: WebApi;
  let testWorkItemId: number;
  let projectName: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    const testConnection = await getTestConnection();
    if (!testConnection) {
      throw new Error(
        'Connection should be available when integration tests are enabled',
      );
    }
    connection = testConnection;
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';

    // Create a test work item
    const uniqueTitle = `Test Work Item Comments ${new Date().toISOString()}`;
    const options: CreateWorkItemOptions = {
      title: uniqueTitle,
      description:
        'Test work item for get-work-item-comments integration tests',
    };

    const testWorkItem = await createWorkItem(
      connection,
      projectName,
      'Task',
      options,
    );

    if (!testWorkItem?.id) {
      throw new Error(
        'Failed to create required work item for testing comments',
      );
    }

    testWorkItemId = testWorkItem.id;

    // Add comments to the work item
    const witApi = await connection.getWorkItemTrackingApi();
    await witApi.addComment(
      { text: 'First test comment' },
      projectName,
      testWorkItemId,
    );
    await witApi.addComment(
      { text: 'Second test comment' },
      projectName,
      testWorkItemId,
    );
  });

  test('should retrieve comments with projectId provided', async () => {
    const result = await getWorkItemComments(connection, {
      workItemId: testWorkItemId,
      projectId: projectName,
    });

    expect(result).toBeDefined();
    expect(result.comments).toBeDefined();
    expect(result.comments?.length).toBeGreaterThanOrEqual(2);

    // Check if comments content is retrieved
    const texts = result.comments?.map((c) => c.text);
    expect(texts).toContain('First test comment');
    expect(texts).toContain('Second test comment');
  });

  test('should retrieve comments and resolve projectId automatically if not provided', async () => {
    const result = await getWorkItemComments(connection, {
      workItemId: testWorkItemId,
    });

    expect(result).toBeDefined();
    expect(result.comments).toBeDefined();
    expect(result.comments?.length).toBeGreaterThanOrEqual(2);
  });

  test('should support pagination options (top)', async () => {
    const result = await getWorkItemComments(connection, {
      workItemId: testWorkItemId,
      projectId: projectName,
      top: 1,
    });

    expect(result).toBeDefined();
    expect(result.comments).toBeDefined();
    expect(result.comments?.length).toBe(1);
  });

  test('should throw AzureDevOpsResourceNotFoundError for non-existent work item', async () => {
    const nonExistentId = 999999999;
    await expect(
      getWorkItemComments(connection, { workItemId: nonExistentId }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });
});

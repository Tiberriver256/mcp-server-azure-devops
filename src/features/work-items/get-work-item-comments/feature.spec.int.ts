import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getWorkItemComments } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors/index.ts';
import { createWorkItem } from '../create-work-item/feature.ts';
import type { CreateWorkItemOptions } from '../types.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getWorkItemComments integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let testWorkItemId: number;
    let projectName: string;

    before(async () => {
      // Get a real connection using environment variables
      const testConnection = await getTestConnection();
      if (!testConnection) {
        throw new Error(
          'Connection should be available when integration tests are enabled',
        );
      }
      connection = testConnection;
      projectName =
        process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';

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

    void test('should retrieve comments with projectId provided', async () => {
      const result = await getWorkItemComments(connection, {
        workItemId: testWorkItemId,
        projectId: projectName,
      });

      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.comments, undefined);
      assert.ok(result.comments !== undefined && result.comments.length >= 2);

      // Check if comments content is retrieved
      const texts = result.comments?.map((c) => c.text);
      assert.ok(texts?.includes('First test comment'));
      assert.ok(texts?.includes('Second test comment'));
    });

    void test('should retrieve comments and resolve projectId automatically if not provided', async () => {
      const result = await getWorkItemComments(connection, {
        workItemId: testWorkItemId,
      });

      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.comments, undefined);
      assert.ok(result.comments !== undefined && result.comments.length >= 2);
    });

    void test('should support pagination options (top)', async () => {
      const result = await getWorkItemComments(connection, {
        workItemId: testWorkItemId,
        projectId: projectName,
        top: 1,
      });

      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.comments, undefined);
      assert.strictEqual(result.comments?.length, 1);
    });

    void test('should throw AzureDevOpsResourceNotFoundError for non-existent work item', async () => {
      const nonExistentId = 999999999;
      await assert.rejects(
        () => getWorkItemComments(connection, { workItemId: nonExistentId }),
        AzureDevOpsResourceNotFoundError,
      );
    });
  },
);

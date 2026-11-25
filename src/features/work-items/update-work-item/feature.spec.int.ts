import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { updateWorkItem } from './feature.ts';
import { createWorkItem } from '../create-work-item/feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import type { CreateWorkItemOptions, UpdateWorkItemOptions } from '../types.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'updateWorkItem integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let createdWorkItemId: number;

    before(async () => {
      // Get a real connection using environment variables
      const testConnection = await getTestConnection();
      if (!testConnection) {
        throw new Error(
          'Connection should be available when integration tests are enabled',
        );
      }
      connection = testConnection;

      // Create a work item to be used by the update tests
      const projectName =
        process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
      const uniqueTitle = `Update Test Work Item ${new Date().toISOString()}`;

      const options: CreateWorkItemOptions = {
        title: uniqueTitle,
        description: 'Initial description for update tests',
        priority: 3,
      };

      const workItem = await createWorkItem(
        connection,
        projectName,
        'Task',
        options,
      );
      if (!workItem?.id) {
        throw new Error('Failed to create work item for update tests');
      }
      createdWorkItemId = workItem.id;
    });

    void test('should update a work item title in Azure DevOps', async () => {
      // Generate a unique updated title
      const updatedTitle = `Updated Title ${new Date().toISOString()}`;

      const options: UpdateWorkItemOptions = {
        title: updatedTitle,
      };

      // Act - make an actual API call to Azure DevOps to update the work item
      const result = await updateWorkItem(
        connection,
        createdWorkItemId,
        options,
      );

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.id, createdWorkItemId);

      // Verify fields match what we updated
      assert.notStrictEqual(result.fields, undefined);
      if (result.fields) {
        assert.strictEqual(result.fields['System.Title'], updatedTitle);
      }
    });

    void test('should update multiple fields at once', async () => {
      const newDescription =
        'This is an updated description from integration tests';
      const newPriority = 1;

      const options: UpdateWorkItemOptions = {
        description: newDescription,
        priority: newPriority,
        additionalFields: {
          'System.Tags': 'UpdateTest,Integration',
        },
      };

      // Act - make an actual API call to Azure DevOps
      const result = await updateWorkItem(
        connection,
        createdWorkItemId,
        options,
      );

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.id, createdWorkItemId);

      // Verify fields match what we updated
      assert.notStrictEqual(result.fields, undefined);
      if (result.fields) {
        assert.strictEqual(result.fields['System.Description'], newDescription);
        assert.strictEqual(
          result.fields['Microsoft.VSTS.Common.Priority'],
          newPriority,
        );
        // Just check that tags contain both values, order may vary
        assert.ok(
          typeof result.fields['System.Tags'] === 'string' &&
            result.fields['System.Tags'].includes('UpdateTest'),
        );
        assert.ok(
          typeof result.fields['System.Tags'] === 'string' &&
            result.fields['System.Tags'].includes('Integration'),
        );
      }
    });

    void test('should throw error when updating non-existent work item', async () => {
      // Use a very large ID that's unlikely to exist
      const nonExistentId = 999999999;

      const options: UpdateWorkItemOptions = {
        title: 'This should fail',
      };

      // Act & Assert - should throw an error for non-existent work item
      await assert.rejects(
        () => updateWorkItem(connection, nonExistentId, options),
        /Failed to update work item|not found/,
      );
    });

    void test('should manage tags using first-class fields (tags, tagsToAdd, tagsToRemove)', async () => {
      // 1. Overwrite tags
      let result = await updateWorkItem(connection, createdWorkItemId, {
        tags: ['A', 'B'],
      });
      assert.notStrictEqual(result.fields, undefined);
      assert.strictEqual(result.fields?.['System.Tags'], 'A; B');

      // 2. Append tags
      result = await updateWorkItem(connection, createdWorkItemId, {
        tagsToAdd: ['B', 'C', 'D'],
      });
      const appendedTags: unknown = result.fields?.['System.Tags'];
      assert.ok(typeof appendedTags === 'string' && appendedTags.includes('A'));
      assert.ok(typeof appendedTags === 'string' && appendedTags.includes('B'));
      assert.ok(typeof appendedTags === 'string' && appendedTags.includes('C'));
      assert.ok(typeof appendedTags === 'string' && appendedTags.includes('D'));

      // 3. Remove tags
      result = await updateWorkItem(connection, createdWorkItemId, {
        tagsToRemove: ['A', 'D', 'E'],
      });
      const remainingTags: unknown = result.fields?.['System.Tags'];
      assert.strictEqual(
        typeof remainingTags === 'string' && remainingTags.includes('A'),
        false,
      );
      assert.ok(
        typeof remainingTags === 'string' && remainingTags.includes('B'),
      );
      assert.ok(
        typeof remainingTags === 'string' && remainingTags.includes('C'),
      );
      assert.strictEqual(
        typeof remainingTags === 'string' && remainingTags.includes('D'),
        false,
      );

      // 4. Overwrite to clear
      result = await updateWorkItem(connection, createdWorkItemId, {
        tags: [],
      });
      assert.strictEqual(result.fields?.['System.Tags'] || '', '');
    });
  },
);

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { listWorkItems } from './feature.ts';
import { createWorkItem } from '../create-work-item/feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import type { CreateWorkItemOptions, ListWorkItemsOptions } from '../types.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'listWorkItems integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    const createdWorkItemIds: number[] = [];
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

      // Create a few work items to ensure we have data to list
      const testPrefix = `List Test ${new Date().toISOString().slice(0, 16)}`;

      for (let i = 0; i < 3; i++) {
        const options: CreateWorkItemOptions = {
          title: `${testPrefix} - Item ${i + 1}`,
          description: `Test item ${i + 1} for list-work-items integration tests`,
          priority: 2,
          additionalFields: {
            'System.Tags': 'ListTest,Integration',
          },
        };

        try {
          const workItem = await createWorkItem(
            connection,
            projectName,
            'Task',
            options,
          );
          if (workItem && workItem.id !== undefined) {
            createdWorkItemIds.push(workItem.id);
          }
        } catch (error) {
          console.error(`Failed to create test work item ${i + 1}:`, error);
        }
      }
    });

    void test('should list work items from a project', async () => {
      const options: ListWorkItemsOptions = {
        projectId: projectName,
      };

      // Act - make an actual API call to Azure DevOps
      const result = await listWorkItems(connection, options);

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(Array.isArray(result), true);

      // Should have at least some work items (including our created ones)
      assert.ok(result.length > 0);

      // Check basic structure of returned work items
      const firstItem = result[0];
      assert.notStrictEqual(firstItem.id, undefined);
      assert.notStrictEqual(firstItem.fields, undefined);

      if (firstItem.fields) {
        assert.notStrictEqual(firstItem.fields['System.Title'], undefined);
      }
    });

    void test('should apply pagination options', async () => {
      // First get all items to know the total count
      const allOptions: ListWorkItemsOptions = {
        projectId: projectName,
      };

      const allItems = await listWorkItems(connection, allOptions);

      // Then get with pagination
      const paginationOptions: ListWorkItemsOptions = {
        projectId: projectName,
        top: 2, // Only get first 2 items
      };

      const paginatedResult = await listWorkItems(
        connection,
        paginationOptions,
      );

      // Assert on pagination
      assert.notStrictEqual(paginatedResult, undefined);
      assert.ok(paginatedResult.length <= 2);

      // If we have more than 2 total items, pagination should have limited results
      if (allItems.length > 2) {
        assert.strictEqual(paginatedResult.length, 2);
        assert.ok(paginatedResult.length < allItems.length);
      }
    });

    void test('should list work items with custom WIQL query', async () => {
      assert.ok(createdWorkItemIds.length > 0);

      // Create a more specific WIQL query that includes the IDs of our created work items
      const workItemIdList = createdWorkItemIds.join(',');
      const wiql = `SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.TeamProject] = '${projectName}' AND [System.Id] IN (${workItemIdList}) AND [System.Tags] CONTAINS 'ListTest' ORDER BY [System.Id]`;

      const options: ListWorkItemsOptions = {
        projectId: projectName,
        wiql,
      };

      // Act - make an actual API call to Azure DevOps
      const result = await listWorkItems(connection, options);

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(Array.isArray(result), true);

      // Should have found our test items with the ListTest tag
      assert.ok(result.length > 0);

      // At least one of our created items should be in the results
      const foundCreatedItem = result.some((item) =>
        createdWorkItemIds.includes(item.id || -1),
      );

      assert.strictEqual(foundCreatedItem, true);
    });
  },
);

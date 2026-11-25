import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getWorkItem } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors/index.ts';
import { createWorkItem } from '../create-work-item/feature.ts';
import { manageWorkItemLink } from '../manage-work-item-link/feature.ts';
import type { CreateWorkItemOptions } from '../types.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getWorkItem integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let testWorkItemId: number;
    let linkedWorkItemId: number;
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
      const uniqueTitle = `Test Work Item ${new Date().toISOString()}`;
      const options: CreateWorkItemOptions = {
        title: uniqueTitle,
        description: 'Test work item for get-work-item integration tests',
      };

      const testWorkItem = await createWorkItem(
        connection,
        projectName,
        'Task',
        options,
      );

      // Create another work item to link to the first one
      const linkedItemOptions: CreateWorkItemOptions = {
        title: `Linked Work Item ${new Date().toISOString()}`,
        description: 'Linked work item for get-work-item integration tests',
      };

      const linkedWorkItem = await createWorkItem(
        connection,
        projectName,
        'Task',
        linkedItemOptions,
      );

      if (!testWorkItem?.id || !linkedWorkItem?.id) {
        throw new Error('Failed to create required work items for testing');
      }

      testWorkItemId = testWorkItem.id;
      linkedWorkItemId = linkedWorkItem.id;

      // Create a link between the two work items
      await manageWorkItemLink(connection, projectName, {
        sourceWorkItemId: testWorkItemId,
        targetWorkItemId: linkedWorkItemId,
        operation: 'add',
        relationType: 'System.LinkTypes.Related',
        comment: 'Link created for get-work-item integration tests',
      });
    });

    void test('should retrieve a real work item from Azure DevOps with default expand=all', async () => {
      // Act - get work item by ID
      const result = await getWorkItem(connection, testWorkItemId);

      // Assert
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.id, testWorkItemId);

      // Verify expanded fields and data are present
      assert.notStrictEqual(result.fields, undefined);
      assert.notStrictEqual(result._links, undefined);

      // With expand=all and a linked item, relations should be defined
      assert.notStrictEqual(result.relations, undefined);

      if (result.fields) {
        // Verify common fields that should be present with expand=all
        assert.notStrictEqual(result.fields['System.Title'], undefined);
        assert.notStrictEqual(result.fields['System.State'], undefined);
        assert.notStrictEqual(result.fields['System.CreatedDate'], undefined);
        assert.notStrictEqual(result.fields['System.ChangedDate'], undefined);
      }
    });

    void test('should retrieve work item with expanded relations', async () => {
      // Act - get work item with relations expansion
      const result = await getWorkItem(connection, testWorkItemId, 'relations');

      // Assert
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.id, testWorkItemId);

      // When using expand=relations on a work item with links, relations should be defined
      assert.notStrictEqual(result.relations, undefined);

      // Verify we can access the related work item
      if (result.relations && result.relations.length > 0) {
        const relation = result.relations[0];
        assert.strictEqual(relation.rel, 'System.LinkTypes.Related');
        assert.ok(relation.url?.includes(linkedWorkItemId.toString()));
      }

      // Verify fields exist
      assert.notStrictEqual(result.fields, undefined);
      if (result.fields) {
        assert.notStrictEqual(result.fields['System.Title'], undefined);
      }
    });

    void test('should retrieve work item with minimal fields when using expand=none', async () => {
      // Act - get work item with no expansion
      const result = await getWorkItem(connection, testWorkItemId, 'none');

      // Assert
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.id, testWorkItemId);
      assert.notStrictEqual(result.fields, undefined);

      // With expand=none, we should still get _links but no relations
      // The Azure DevOps API still returns _links even with expand=none
      assert.strictEqual(result.relations, undefined);
    });

    void test('should throw AzureDevOpsResourceNotFoundError for non-existent work item', async () => {
      // Use a very large ID that's unlikely to exist
      const nonExistentId = 999999999;

      // Assert that it throws the correct error
      await assert.rejects(
        () => getWorkItem(connection, nonExistentId),
        AzureDevOpsResourceNotFoundError,
      );
    });

    void test('should include all possible fields with null values for empty fields', async () => {
      // Act - get work item by ID
      const result = await getWorkItem(connection, testWorkItemId);

      // Assert
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.fields, undefined);

      if (result.fields) {
        // Get a direct connection to WorkItemTrackingApi to fetch field info for comparison
        const witApi = await connection.getWorkItemTrackingApi();
        const projectName = result.fields['System.TeamProject'];
        const workItemType = result.fields['System.WorkItemType'];

        assert.notStrictEqual(projectName, undefined);
        assert.notStrictEqual(workItemType, undefined);

        if (projectName && workItemType) {
          // Get all possible field references for this work item type
          const allFields = await witApi.getWorkItemTypeFieldsWithReferences(
            projectName.toString(),
            workItemType.toString(),
          );

          // Check that all fields from the reference are present in the result
          // Some might be null, but they should exist in the fields object
          const fieldKeys = new Set(Object.keys(result.fields));
          for (const field of allFields) {
            if (field.referenceName) {
              assert.ok(fieldKeys.has(field.referenceName));
            }
          }

          // There should be at least one field with a null value
          // (This is a probabilistic test but very likely to pass since work items
          // typically have many optional fields that aren't filled in)
          const hasNullField = Object.values(result.fields).some(
            (value) => value === null,
          );
          assert.strictEqual(hasNullField, true);
        }
      }
    });
  },
);

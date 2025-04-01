import { WebApi } from 'azure-devops-node-api';
import { getWorkItem } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../__test__/test-helpers';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors';
import { createWorkItem } from '../create-work-item/feature';
import { manageWorkItemLink } from '../manage-work-item-link/feature';
import { CreateWorkItemOptions } from '../types';

describe('getWorkItem integration', () => {
  let connection: WebApi | null = null;
  let testWorkItemId: number | null = null;
  let linkedWorkItemId: number | null = null;
  let projectName: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';

    // Skip setup if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      return;
    }

    try {
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

      if (testWorkItem?.id && linkedWorkItem?.id) {
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
      }
    } catch (error) {
      console.error('Failed to create test work items:', error);
    }
  });

  test('should retrieve a real work item from Azure DevOps with default expand=all', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest() || !connection || !testWorkItemId) {
      return;
    }

    // Act - get work item by ID
    const result = await getWorkItem(connection, testWorkItemId);

    // Assert
    expect(result).toBeDefined();
    expect(result.id).toBe(testWorkItemId);

    // Verify expanded fields and data are present
    expect(result.fields).toBeDefined();
    expect(result._links).toBeDefined();

    // With expand=all and a linked item, relations should be defined
    expect(result.relations).toBeDefined();

    if (result.fields) {
      // Verify common fields that should be present with expand=all
      expect(result.fields['System.Title']).toBeDefined();
      expect(result.fields['System.State']).toBeDefined();
      expect(result.fields['System.CreatedDate']).toBeDefined();
      expect(result.fields['System.ChangedDate']).toBeDefined();
    }
  });

  test('should retrieve work item with expanded relations', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest() || !connection || !testWorkItemId) {
      return;
    }

    // Act - get work item with relations expansion
    const result = await getWorkItem(
      connection,
      testWorkItemId,
      WorkItemExpand.Relations,
    );

    // Assert
    expect(result).toBeDefined();
    expect(result.id).toBe(testWorkItemId);

    // When using expand=relations on a work item with links, relations should be defined
    expect(result.relations).toBeDefined();

    // Verify we can access the related work item
    if (result.relations && result.relations.length > 0) {
      const relation = result.relations[0];
      expect(relation.rel).toBe('System.LinkTypes.Related');
      expect(relation.url).toContain(linkedWorkItemId?.toString());
    }

    // Verify fields exist
    expect(result.fields).toBeDefined();
    if (result.fields) {
      expect(result.fields['System.Title']).toBeDefined();
    }
  });

  test('should retrieve work item with minimal fields when using expand=none', async () => {
    if (shouldSkipIntegrationTest() || !connection || !testWorkItemId) {
      return;
    }

    // Act - get work item with no expansion
    const result = await getWorkItem(
      connection,
      testWorkItemId,
      WorkItemExpand.None,
    );

    // Assert
    expect(result).toBeDefined();
    expect(result.id).toBe(testWorkItemId);
    expect(result.fields).toBeDefined();

    // With expand=none, we should still get _links but no relations
    // The Azure DevOps API still returns _links even with expand=none
    expect(result.relations).toBeUndefined();
  });

  test('should throw AzureDevOpsResourceNotFoundError for non-existent work item', async () => {
    if (shouldSkipIntegrationTest() || !connection) {
      return;
    }

    // Use a very large ID that's unlikely to exist
    const nonExistentId = 999999999;

    // Assert that it throws the correct error
    await expect(getWorkItem(connection, nonExistentId)).rejects.toThrow(
      AzureDevOpsResourceNotFoundError,
    );
  });
});

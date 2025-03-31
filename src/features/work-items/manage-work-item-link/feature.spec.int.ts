import { WebApi } from 'azure-devops-node-api';
import { manageWorkItemLink } from './feature';
import { createWorkItem } from '../create-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers';
import { CreateWorkItemOptions } from '../types';

// Note: These tests will be skipped in CI due to missing credentials
// They are meant to be run manually in a dev environment with proper Azure DevOps setup
describe('manageWorkItemLink integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;
  let sourceWorkItemId: number | null = null;
  let targetWorkItemId: number | null = null;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';

    // Skip setup if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      return;
    }

    try {
      // Create source work item for link tests
      const sourceOptions: CreateWorkItemOptions = {
        title: `Source Work Item for Link Tests ${new Date().toISOString()}`,
        description:
          'Source work item for integration tests of manage-work-item-link',
      };

      const sourceWorkItem = await createWorkItem(
        connection,
        projectName,
        'Task',
        sourceOptions,
      );

      // Create target work item for link tests
      const targetOptions: CreateWorkItemOptions = {
        title: `Target Work Item for Link Tests ${new Date().toISOString()}`,
        description:
          'Target work item for integration tests of manage-work-item-link',
      };

      const targetWorkItem = await createWorkItem(
        connection,
        projectName,
        'Task',
        targetOptions,
      );

      // Store the work item IDs for the tests
      if (sourceWorkItem && sourceWorkItem.id !== undefined) {
        sourceWorkItemId = sourceWorkItem.id;
      }
      if (targetWorkItem && targetWorkItem.id !== undefined) {
        targetWorkItemId = targetWorkItem.id;
      }
    } catch (error) {
      console.error('Failed to create work items for link tests:', error);
    }
  });

  test('should add a link between two existing work items', async () => {
    // Skip if integration tests should be skipped or if work items weren't created
    if (
      shouldSkipIntegrationTest() ||
      !connection ||
      !sourceWorkItemId ||
      !targetWorkItemId
    ) {
      return;
    }

    // Act & Assert - should not throw
    const result = await manageWorkItemLink(connection, projectName, {
      sourceWorkItemId,
      targetWorkItemId,
      operation: 'add',
      relationType: 'System.LinkTypes.Related',
      comment: 'Link created by integration test',
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.id).toBe(sourceWorkItemId);
  });

  test('should handle non-existent work items gracefully', async () => {
    // Skip if integration tests should be skipped or if no connection
    if (shouldSkipIntegrationTest() || !connection) {
      return;
    }

    // Use a very large ID that's unlikely to exist
    const nonExistentId = 999999999;

    // Act & Assert - should throw an error for non-existent work item
    await expect(
      manageWorkItemLink(connection, projectName, {
        sourceWorkItemId: nonExistentId,
        targetWorkItemId: nonExistentId,
        operation: 'add',
        relationType: 'System.LinkTypes.Related',
      }),
    ).rejects.toThrow(/[Ww]ork [Ii]tem.*not found|does not exist/);
  });

  test('should handle non-existent relationship types gracefully', async () => {
    // Skip if integration tests should be skipped or if work items weren't created
    if (
      shouldSkipIntegrationTest() ||
      !connection ||
      !sourceWorkItemId ||
      !targetWorkItemId
    ) {
      return;
    }

    // Act & Assert - should throw an error for non-existent relation type
    await expect(
      manageWorkItemLink(connection, projectName, {
        sourceWorkItemId,
        targetWorkItemId,
        operation: 'add',
        relationType: 'NonExistentLinkType',
      }),
    ).rejects.toThrow(/[Rr]elation|[Ll]ink|[Tt]ype/); // Error may vary, but should mention relation/link/type
  });
});

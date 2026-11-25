import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { manageWorkItemLink } from './feature.ts';
import { createWorkItem } from '../create-work-item/feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import type { CreateWorkItemOptions } from '../types.ts';

// Note: These tests will be skipped in CI due to missing credentials
// They are meant to be run manually in a dev environment with proper Azure DevOps setup
const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'manageWorkItemLink integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let projectName: string;
    let sourceWorkItemId: number;
    let targetWorkItemId: number;

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

      if (!sourceWorkItem?.id || !targetWorkItem?.id) {
        throw new Error('Failed to create work items for link tests');
      }

      sourceWorkItemId = sourceWorkItem.id;
      targetWorkItemId = targetWorkItem.id;
    });

    void test('should add a link between two existing work items', async () => {
      // Act & Assert - should not throw
      const result = await manageWorkItemLink(connection, projectName, {
        sourceWorkItemId,
        targetWorkItemId,
        operation: 'add',
        relationType: 'System.LinkTypes.Related',
        comment: 'Link created by integration test',
      });

      // Assert
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.id, sourceWorkItemId);
    });

    void test('should remove a link between two existing work items', async () => {
      // Act & Assert - should not throw
      const result = await manageWorkItemLink(connection, projectName, {
        sourceWorkItemId,
        targetWorkItemId,
        operation: 'remove',
        relationType: 'System.LinkTypes.Related',
      });

      // Assert
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.id, sourceWorkItemId);
    });

    void test('should handle non-existent work items gracefully', async () => {
      // Use a very large ID that's unlikely to exist
      const nonExistentId = 999999999;

      // Act & Assert - should throw an error for non-existent work item
      await assert.rejects(
        () =>
          manageWorkItemLink(connection, projectName, {
            sourceWorkItemId: nonExistentId,
            targetWorkItemId: nonExistentId,
            operation: 'add',
            relationType: 'System.LinkTypes.Related',
          }),
        /[Ww]ork [Ii]tem.*not found|does not exist/,
      );
    });

    void test('should handle non-existent relationship types gracefully', async () => {
      // Act & Assert - should throw an error for non-existent relation type
      await assert.rejects(
        () =>
          manageWorkItemLink(connection, projectName, {
            sourceWorkItemId,
            targetWorkItemId,
            operation: 'add',
            relationType: 'NonExistentLinkType',
          }),
        /[Rr]elation|[Ll]ink|[Tt]ype/, // Error may vary, but should mention relation/link/type
      );
    });
  },
);

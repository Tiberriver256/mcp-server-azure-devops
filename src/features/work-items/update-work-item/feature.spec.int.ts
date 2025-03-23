import { WebApi } from 'azure-devops-node-api';
import { updateWorkItem } from './feature';
import { createWorkItem } from '../create-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { CreateWorkItemOptions, UpdateWorkItemOptions } from '../types';

describe('updateWorkItem integration', () => {
  let connection: WebApi | null = null;
  let createdWorkItemId: number | null = null;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();

    // Skip setup if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      return;
    }

    // Create a work item to be used by the update tests
    const projectName =
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    const uniqueTitle = `Update Test Work Item ${new Date().toISOString()}`;

    const options: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'Initial description for update tests',
      priority: 3,
    };

    try {
      const workItem = await createWorkItem(
        connection,
        projectName,
        'Task',
        options,
      );
      // Ensure the ID is a number
      if (workItem && workItem.id !== undefined) {
        createdWorkItemId = workItem.id;
      }
    } catch (error) {
      console.error('Failed to create work item for update tests:', error);
    }
  });

  test('should update a work item title in Azure DevOps', async () => {
    // Skip if no connection is available or if work item wasn't created
    if (shouldSkipIntegrationTest() || !connection || !createdWorkItemId) {
      return;
    }

    // Generate a unique updated title
    const updatedTitle = `Updated Title ${new Date().toISOString()}`;

    const options: UpdateWorkItemOptions = {
      title: updatedTitle,
    };

    // Act - make an actual API call to Azure DevOps to update the work item
    const result = await updateWorkItem(connection, createdWorkItemId, options);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    // Verify fields match what we updated
    expect(result.fields).toBeDefined();
    if (result.fields) {
      expect(result.fields['System.Title']).toBe(updatedTitle);
    }
  });

  test('should update multiple fields at once', async () => {
    // Skip if no connection is available or if work item wasn't created
    if (shouldSkipIntegrationTest() || !connection || !createdWorkItemId) {
      return;
    }

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
    const result = await updateWorkItem(connection, createdWorkItemId, options);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    // Verify fields match what we updated
    expect(result.fields).toBeDefined();
    if (result.fields) {
      expect(result.fields['System.Description']).toBe(newDescription);
      expect(result.fields['Microsoft.VSTS.Common.Priority']).toBe(newPriority);
      // Just check that tags contain both values, order may vary
      expect(result.fields['System.Tags']).toContain('UpdateTest');
      expect(result.fields['System.Tags']).toContain('Integration');
    }
  });

  test('should throw error when updating non-existent work item', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest() || !connection) {
      return;
    }

    // Use a very large ID that's unlikely to exist
    const nonExistentId = 999999999;

    const options: UpdateWorkItemOptions = {
      title: 'This should fail',
    };

    // Act & Assert - should throw an error for non-existent work item
    await expect(
      updateWorkItem(connection, nonExistentId, options),
    ).rejects.toThrow(/Failed to update work item|not found/);
  });
});

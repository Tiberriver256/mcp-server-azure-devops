import { WebApi } from 'azure-devops-node-api';
import { listWorkItems } from './feature';
import { createWorkItem } from '../create-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { CreateWorkItemOptions, ListWorkItemsOptions } from '../types';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('listWorkItems integration', () => {
  let connection: WebApi;
  const createdWorkItemIds: number[] = [];
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

  test('should list work items from a project', async () => {
    const options: ListWorkItemsOptions = {
      projectId: projectName,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await listWorkItems(connection, options);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);

    // Should have at least some work items (including our created ones)
    expect(result.length).toBeGreaterThan(0);

    // Check basic structure of returned work items
    const firstItem = result[0];
    expect(firstItem.id).toBeDefined();
    expect(firstItem.fields).toBeDefined();

    if (firstItem.fields) {
      expect(firstItem.fields['System.Title']).toBeDefined();
    }
  });

  test('should apply pagination options', async () => {
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

    const paginatedResult = await listWorkItems(connection, paginationOptions);

    // Assert on pagination
    expect(paginatedResult).toBeDefined();
    expect(paginatedResult.length).toBeLessThanOrEqual(2);

    // If we have more than 2 total items, pagination should have limited results
    if (allItems.length > 2) {
      expect(paginatedResult.length).toBe(2);
      expect(paginatedResult.length).toBeLessThan(allItems.length);
    }
  });

  test('should list work items with custom WIQL query', async () => {
    expect(createdWorkItemIds.length).toBeGreaterThan(0);

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
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);

    // Should have found our test items with the ListTest tag
    expect(result.length).toBeGreaterThan(0);

    // At least one of our created items should be in the results
    const foundCreatedItem = result.some((item) =>
      createdWorkItemIds.includes(item.id || -1),
    );

    expect(foundCreatedItem).toBe(true);
  });
});

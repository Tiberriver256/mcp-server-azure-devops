import { WebApi } from 'azure-devops-node-api';
import { createWorkItem } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { CreateWorkItemOptions } from '../types';

describe('createWorkItem integration', () => {
  let connection: WebApi | null = null;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
  });

  test('should create a new work item in Azure DevOps', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // Create a unique title using timestamp to avoid conflicts
    const uniqueTitle = `Test Work Item ${new Date().toISOString()}`;

    // For a true integration test, use a real project
    const projectName =
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    const workItemType = 'Task'; // Assumes 'Task' type exists in the project

    const options: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'This is a test work item created by an integration test',
      priority: 2,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await createWorkItem(
      connection,
      projectName,
      workItemType,
      options,
    );

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();

    // Verify fields match what we set
    expect(result.fields).toBeDefined();
    if (result.fields) {
      expect(result.fields['System.Title']).toBe(uniqueTitle);
      expect(result.fields['Microsoft.VSTS.Common.Priority']).toBe(2);
    }
  });

  test('should create a work item with additional fields', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // Create a unique title using timestamp to avoid conflicts
    const uniqueTitle = `Test Work Item with Fields ${new Date().toISOString()}`;

    // For a true integration test, use a real project
    const projectName =
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    const workItemType = 'Task';

    const options: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'This is a test work item with additional fields',
      priority: 1,
      additionalFields: {
        'System.Tags': 'Integration Test,Automated',
      },
    };

    // Act - make an actual API call to Azure DevOps
    const result = await createWorkItem(
      connection,
      projectName,
      workItemType,
      options,
    );

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();

    // Verify fields match what we set
    expect(result.fields).toBeDefined();
    if (result.fields) {
      expect(result.fields['System.Title']).toBe(uniqueTitle);
      expect(result.fields['Microsoft.VSTS.Common.Priority']).toBe(1);
      // Just check that tags contain both values, order may vary
      expect(result.fields['System.Tags']).toContain('Integration Test');
      expect(result.fields['System.Tags']).toContain('Automated');
    }
  });

  test('should create a child work item with parent-child relationship', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // For a true integration test, use a real project
    const projectName =
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';

    // First, create a parent work item (User Story)
    const parentTitle = `Parent Story ${new Date().toISOString()}`;
    const parentOptions: CreateWorkItemOptions = {
      title: parentTitle,
      description: 'This is a parent user story',
    };

    const parentResult = await createWorkItem(
      connection,
      projectName,
      'User Story', // Assuming User Story type exists
      parentOptions,
    );

    expect(parentResult).toBeDefined();
    expect(parentResult.id).toBeDefined();
    const parentId = parentResult.id;

    // Now create a child work item (Task) with a link to the parent
    const childTitle = `Child Task ${new Date().toISOString()}`;
    const childOptions: CreateWorkItemOptions = {
      title: childTitle,
      description: 'This is a child task of a user story',
      parentId: parentId, // Reference to parent work item
    };

    const childResult = await createWorkItem(
      connection,
      projectName,
      'Task',
      childOptions,
    );

    // Assert the child work item was created
    expect(childResult).toBeDefined();
    expect(childResult.id).toBeDefined();

    // Now verify the parent-child relationship
    // We would need to fetch the relations, but for now we'll just assert
    // that the response indicates a relationship was created
    expect(childResult.relations).toBeDefined();

    // Check that at least one relation exists that points to our parent
    const parentRelation = childResult.relations?.find(
      (relation) =>
        relation.rel === 'System.LinkTypes.Hierarchy-Reverse' &&
        relation.url &&
        relation.url.includes(`/${parentId}`),
    );
    expect(parentRelation).toBeDefined();
  });
});

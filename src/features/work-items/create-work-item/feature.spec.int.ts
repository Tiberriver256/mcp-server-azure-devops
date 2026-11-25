import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { createWorkItem } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import type { CreateWorkItemOptions } from '../types.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'createWorkItem integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;

    before(async () => {
      // Get a real connection using environment variables
      const testConnection = await getTestConnection();
      if (!testConnection) {
        throw new Error(
          'Connection should be available when integration tests are enabled',
        );
      }
      connection = testConnection;
    });

    void test('should create a new work item in Azure DevOps', async () => {
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
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.id, undefined);

      // Verify fields match what we set
      assert.notStrictEqual(result.fields, undefined);
      if (result.fields) {
        assert.strictEqual(result.fields['System.Title'], uniqueTitle);
        assert.strictEqual(result.fields['Microsoft.VSTS.Common.Priority'], 2);
      }
    });

    void test('should create a work item with additional fields', async () => {
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
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.id, undefined);

      // Verify fields match what we set
      assert.notStrictEqual(result.fields, undefined);
      if (result.fields) {
        assert.strictEqual(result.fields['System.Title'], uniqueTitle);
        assert.strictEqual(result.fields['Microsoft.VSTS.Common.Priority'], 1);
        // Just check that tags contain both values, order may vary
        assert.ok(
          typeof result.fields['System.Tags'] === 'string' &&
            result.fields['System.Tags'].includes('Integration Test'),
        );
        assert.ok(
          typeof result.fields['System.Tags'] === 'string' &&
            result.fields['System.Tags'].includes('Automated'),
        );
      }
    });

    void test('should create a child work item with parent-child relationship', async () => {
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

      assert.notStrictEqual(parentResult, undefined);
      assert.notStrictEqual(parentResult.id, undefined);
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
      assert.notStrictEqual(childResult, undefined);
      assert.notStrictEqual(childResult.id, undefined);

      // Now verify the parent-child relationship
      // We would need to fetch the relations, but for now we'll just assert
      // that the response indicates a relationship was created
      assert.notStrictEqual(childResult.relations, undefined);

      // Check that at least one relation exists that points to our parent
      const parentRelation = childResult.relations?.find(
        (relation) =>
          relation.rel === 'System.LinkTypes.Hierarchy-Reverse' &&
          relation.url &&
          relation.url.includes(`/${parentId}`),
      );
      assert.notStrictEqual(parentRelation, undefined);
    });

    void test('should create a work item with markdown description format', async () => {
      const uniqueTitle = `Markdown Work Item ${new Date().toISOString()}`;
      const projectName =
        process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
      const markdownDescription = '## Heading\n\n- item 1\n- item 2';

      const result = await createWorkItem(connection, projectName, 'Task', {
        title: uniqueTitle,
        description: markdownDescription,
        descriptionFormat: 'markdown',
      });

      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.id, undefined);
      assert.strictEqual(
        result.fields?.['System.Description'],
        markdownDescription,
      );

      type WorkItemWithMultilineFormat = typeof result & {
        multilineFieldsFormat?: Record<string, string>;
      };

      let format = (result as WorkItemWithMultilineFormat)
        .multilineFieldsFormat?.['System.Description'];
      if (!format && result.id) {
        const witApi = await connection.getWorkItemTrackingApi();
        const fetched = (await witApi.getWorkItem(
          result.id,
        )) as WorkItemWithMultilineFormat;
        format = fetched.multilineFieldsFormat?.['System.Description'];
      }

      assert.strictEqual(format?.toLowerCase(), 'markdown');
    });
  },
);

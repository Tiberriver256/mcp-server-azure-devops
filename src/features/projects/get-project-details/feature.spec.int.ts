import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getProjectDetails } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getProjectDetails integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
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
    });

    void test('should retrieve basic project details from Azure DevOps', async () => {
      // Act - make an actual API call to Azure DevOps
      const result = await getProjectDetails(connection, {
        projectId: projectName,
      });

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result.name, projectName);
      assert.notStrictEqual(result.id, undefined);
      assert.notStrictEqual(result.url, undefined);
      assert.notStrictEqual(result.state, undefined);

      // Verify basic project structure
      assert.notStrictEqual(result.visibility, undefined);
      assert.notStrictEqual(result.lastUpdateTime, undefined);
      assert.notStrictEqual(result.capabilities, undefined);
    });

    void test('should retrieve project details with teams from Azure DevOps', async () => {
      // Act - make an actual API call to Azure DevOps
      const result = await getProjectDetails(connection, {
        projectId: projectName,
        includeTeams: true,
      });

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.teams, undefined);
      assert.strictEqual(Array.isArray(result.teams), true);

      // There should be at least one team (the default team)
      if (result.teams && result.teams.length > 0) {
        const team = result.teams[0];
        assert.notStrictEqual(team.id, undefined);
        assert.notStrictEqual(team.name, undefined);
        assert.notStrictEqual(team.url, undefined);
      }
    });

    void test('should retrieve project details with process information from Azure DevOps', async () => {
      // Act - make an actual API call to Azure DevOps
      const result = await getProjectDetails(connection, {
        projectId: projectName,
        includeProcess: true,
      });

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.process, undefined);
      assert.notStrictEqual(result.process?.name, undefined);
    });

    void test('should retrieve project details with work item types from Azure DevOps', async () => {
      // Act - make an actual API call to Azure DevOps
      const result = await getProjectDetails(connection, {
        projectId: projectName,
        includeProcess: true,
        includeWorkItemTypes: true,
      });

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.process, undefined);
      assert.notStrictEqual(result.process?.workItemTypes, undefined);
      assert.strictEqual(Array.isArray(result.process?.workItemTypes), true);

      // There should be at least one work item type
      if (
        result.process?.workItemTypes &&
        result.process.workItemTypes.length > 0
      ) {
        const workItemType = result.process.workItemTypes[0];
        assert.notStrictEqual(workItemType.name, undefined);
        assert.notStrictEqual(workItemType.description, undefined);
        assert.notStrictEqual(workItemType.states, undefined);
      }
    });

    void test('should retrieve project details with fields from Azure DevOps', async () => {
      // Act - make an actual API call to Azure DevOps
      const result = await getProjectDetails(connection, {
        projectId: projectName,
        includeProcess: true,
        includeWorkItemTypes: true,
        includeFields: true,
      });

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.process, undefined);
      assert.notStrictEqual(result.process?.workItemTypes, undefined);

      // There should be at least one work item type with fields
      if (
        result.process?.workItemTypes &&
        result.process.workItemTypes.length > 0
      ) {
        const workItemType = result.process.workItemTypes[0];
        assert.notStrictEqual(workItemType.fields, undefined);
        assert.strictEqual(Array.isArray(workItemType.fields), true);

        // There should be at least one field (like Title)
        if (workItemType.fields && workItemType.fields.length > 0) {
          const field = workItemType.fields[0];
          assert.notStrictEqual(field.name, undefined);
          assert.notStrictEqual(field.referenceName, undefined);
        }
      }
    });

    void test('should throw error when project is not found', async () => {
      // Use a non-existent project name
      const nonExistentProjectName = 'non-existent-project-' + Date.now();

      // Act & Assert - should throw an error for non-existent project
      await assert.rejects(
        () =>
          getProjectDetails(connection, {
            projectId: nonExistentProjectName,
          }),
        /not found|Failed to get project/,
      );
    });
  },
);

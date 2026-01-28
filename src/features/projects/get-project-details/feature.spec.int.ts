import { WebApi } from 'azure-devops-node-api';
import { getProjectDetails } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('getProjectDetails integration', () => {
  let connection: WebApi;
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
  });

  test('should retrieve basic project details from Azure DevOps', async () => {
    // Act - make an actual API call to Azure DevOps
    const result = await getProjectDetails(connection, {
      projectId: projectName,
    });

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.name).toBe(projectName);
    expect(result.id).toBeDefined();
    expect(result.url).toBeDefined();
    expect(result.state).toBeDefined();

    // Verify basic project structure
    expect(result.visibility).toBeDefined();
    expect(result.lastUpdateTime).toBeDefined();
    expect(result.capabilities).toBeDefined();
  });

  test('should retrieve project details with teams from Azure DevOps', async () => {
    // Act - make an actual API call to Azure DevOps
    const result = await getProjectDetails(connection, {
      projectId: projectName,
      includeTeams: true,
    });

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.teams).toBeDefined();
    expect(Array.isArray(result.teams)).toBe(true);

    // There should be at least one team (the default team)
    if (result.teams && result.teams.length > 0) {
      const team = result.teams[0];
      expect(team.id).toBeDefined();
      expect(team.name).toBeDefined();
      expect(team.url).toBeDefined();
    }
  });

  test('should retrieve project details with process information from Azure DevOps', async () => {
    // Act - make an actual API call to Azure DevOps
    const result = await getProjectDetails(connection, {
      projectId: projectName,
      includeProcess: true,
    });

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.process).toBeDefined();
    expect(result.process?.name).toBeDefined();
  });

  test('should retrieve project details with work item types from Azure DevOps', async () => {
    // Act - make an actual API call to Azure DevOps
    const result = await getProjectDetails(connection, {
      projectId: projectName,
      includeProcess: true,
      includeWorkItemTypes: true,
    });

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.process).toBeDefined();
    expect(result.process?.workItemTypes).toBeDefined();
    expect(Array.isArray(result.process?.workItemTypes)).toBe(true);

    // There should be at least one work item type
    if (
      result.process?.workItemTypes &&
      result.process.workItemTypes.length > 0
    ) {
      const workItemType = result.process.workItemTypes[0];
      expect(workItemType.name).toBeDefined();
      expect(workItemType.description).toBeDefined();
      expect(workItemType.states).toBeDefined();
    }
  });

  test('should retrieve project details with fields from Azure DevOps', async () => {
    // Act - make an actual API call to Azure DevOps
    const result = await getProjectDetails(connection, {
      projectId: projectName,
      includeProcess: true,
      includeWorkItemTypes: true,
      includeFields: true,
    });

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.process).toBeDefined();
    expect(result.process?.workItemTypes).toBeDefined();

    // There should be at least one work item type with fields
    if (
      result.process?.workItemTypes &&
      result.process.workItemTypes.length > 0
    ) {
      const workItemType = result.process.workItemTypes[0];
      expect(workItemType.fields).toBeDefined();
      expect(Array.isArray(workItemType.fields)).toBe(true);

      // There should be at least one field (like Title)
      if (workItemType.fields && workItemType.fields.length > 0) {
        const field = workItemType.fields[0];
        expect(field.name).toBeDefined();
        expect(field.referenceName).toBeDefined();
      }
    }
  });

  test('should throw error when project is not found', async () => {
    // Use a non-existent project name
    const nonExistentProjectName = 'non-existent-project-' + Date.now();

    // Act & Assert - should throw an error for non-existent project
    await expect(
      getProjectDetails(connection, {
        projectId: nonExistentProjectName,
      }),
    ).rejects.toThrow(/not found|Failed to get project/);
  });
});

import { getProjectDetails } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import {
  TeamProject,
  WebApiTeam,
} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { WebApi } from 'azure-devops-node-api';
import { WorkItemType } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';

// Create mock interfaces for the APIs we'll use
interface MockCoreApi {
  getProject: jest.Mock<Promise<TeamProject | null>>;
  getTeams: jest.Mock<Promise<WebApiTeam[]>>;
}

interface MockWorkItemTrackingApi {
  getWorkItemTypes: jest.Mock<Promise<WorkItemType[]>>;
}

interface MockProcessApi {
  getProcesses: jest.Mock<Promise<any[]>>;
  getProcessWorkItemTypes: jest.Mock<Promise<any[]>>;
}

// Create a mock connection that resembles WebApi with minimal implementation
interface MockConnection {
  getCoreApi: jest.Mock<Promise<MockCoreApi>>;
  getWorkItemTrackingApi: jest.Mock<Promise<MockWorkItemTrackingApi>>;
  getProcessApi: jest.Mock<Promise<MockProcessApi>>;
  serverUrl?: string;
  authHandler?: unknown;
  rest?: unknown;
  vsoClient?: unknown;
}

// Sample data for tests
const mockProject = {
  id: 'project-id',
  name: 'Test Project',
  description: 'A test project',
  url: 'https://dev.azure.com/org/project',
  state: 1, // wellFormed
  revision: 123,
  visibility: 0, // private
  lastUpdateTime: new Date(),
  capabilities: {
    versioncontrol: {
      sourceControlType: 'Git',
    },
    processTemplate: {
      templateName: 'Agile',
      templateTypeId: 'template-guid',
    },
  },
} as unknown as TeamProject;

const mockTeams: WebApiTeam[] = [
  {
    id: 'team-guid-1',
    name: 'Team 1',
    description: 'First team',
    url: 'https://dev.azure.com/org/_apis/projects/project-guid/teams/team-guid-1',
    identityUrl: 'https://vssps.dev.azure.com/org/_apis/Identities/team-guid-1',
  } as WebApiTeam,
  {
    id: 'team-guid-2',
    name: 'Team 2',
    description: 'Second team',
    url: 'https://dev.azure.com/org/_apis/projects/project-guid/teams/team-guid-2',
    identityUrl: 'https://vssps.dev.azure.com/org/_apis/Identities/team-guid-2',
  } as WebApiTeam,
];

const mockWorkItemTypes: WorkItemType[] = [
  {
    name: 'User Story',
    description: 'Tracks user requirements',
    referenceName: 'Microsoft.VSTS.WorkItemTypes.UserStory',
    color: 'blue',
    icon: 'icon-user-story',
    isDisabled: false,
  } as WorkItemType,
  {
    name: 'Bug',
    description: 'Tracks defects in the product',
    referenceName: 'Microsoft.VSTS.WorkItemTypes.Bug',
    color: 'red',
    icon: 'icon-bug',
    isDisabled: false,
  } as WorkItemType,
];

const mockProcesses = [
  {
    id: 'process-guid',
    name: 'Agile',
    description: 'Agile process',
    isDefault: true,
    type: 'system',
  },
];

const mockProcessWorkItemTypes = [
  {
    name: 'User Story',
    referenceName: 'Microsoft.VSTS.WorkItemTypes.UserStory',
    description: 'Tracks user requirements',
    color: 'blue',
    icon: 'icon-user-story',
    isDisabled: false,
    states: [
      {
        name: 'New',
        color: 'blue',
        stateCategory: 'Proposed',
      },
      {
        name: 'Active',
        color: 'blue',
        stateCategory: 'InProgress',
      },
      {
        name: 'Resolved',
        color: 'blue',
        stateCategory: 'InProgress',
      },
      {
        name: 'Closed',
        color: 'blue',
        stateCategory: 'Completed',
      },
    ],
    fields: [
      {
        name: 'Title',
        referenceName: 'System.Title',
        type: 'string',
        required: true,
      },
      {
        name: 'Description',
        referenceName: 'System.Description',
        type: 'html',
      },
    ],
  },
  {
    name: 'Bug',
    referenceName: 'Microsoft.VSTS.WorkItemTypes.Bug',
    description: 'Tracks defects in the product',
    color: 'red',
    icon: 'icon-bug',
    isDisabled: false,
    states: [
      {
        name: 'New',
        color: 'red',
        stateCategory: 'Proposed',
      },
      {
        name: 'Active',
        color: 'red',
        stateCategory: 'InProgress',
      },
      {
        name: 'Resolved',
        color: 'red',
        stateCategory: 'InProgress',
      },
      {
        name: 'Closed',
        color: 'red',
        stateCategory: 'Completed',
      },
    ],
    fields: [
      {
        name: 'Title',
        referenceName: 'System.Title',
        type: 'string',
        required: true,
      },
      {
        name: 'Repro Steps',
        referenceName: 'Microsoft.VSTS.TCM.ReproSteps',
        type: 'html',
      },
    ],
  },
];

// Unit tests should only focus on isolated logic
describe('getProjectDetails unit', () => {
  test('should throw resource not found error when project is null', async () => {
    // Arrange
    const mockCoreApi: MockCoreApi = {
      getProject: jest.fn().mockResolvedValue(null), // Simulate project not found
      getTeams: jest.fn().mockResolvedValue([]),
    };

    const mockConnection: MockConnection = {
      getCoreApi: jest.fn().mockResolvedValue(mockCoreApi),
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getWorkItemTypes: jest.fn().mockResolvedValue([]),
      }),
      getProcessApi: jest.fn().mockResolvedValue({
        getProcesses: jest.fn().mockResolvedValue([]),
        getProcessWorkItemTypes: jest.fn().mockResolvedValue([]),
      }),
    };

    // Act & Assert
    await expect(
      getProjectDetails(mockConnection as unknown as WebApi, {
        projectId: 'non-existent-project',
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);

    await expect(
      getProjectDetails(mockConnection as unknown as WebApi, {
        projectId: 'non-existent-project',
      }),
    ).rejects.toThrow("Project 'non-existent-project' not found");
  });

  test('should return basic project details when no additional options are specified', async () => {
    // Arrange
    const mockCoreApi: MockCoreApi = {
      getProject: jest.fn().mockResolvedValue(mockProject),
      getTeams: jest.fn().mockResolvedValue([]),
    };

    const mockConnection: MockConnection = {
      getCoreApi: jest.fn().mockResolvedValue(mockCoreApi),
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getWorkItemTypes: jest.fn().mockResolvedValue([]),
      }),
      getProcessApi: jest.fn().mockResolvedValue({
        getProcesses: jest.fn().mockResolvedValue([]),
        getProcessWorkItemTypes: jest.fn().mockResolvedValue([]),
      }),
    };

    // Act
    const result = await getProjectDetails(
      mockConnection as unknown as WebApi,
      {
        projectId: 'test-project',
      },
    );

    // Assert
    expect(result).toBeDefined();
    expect(result.id).toBe(mockProject.id);
    expect(result.name).toBe(mockProject.name);
    expect(result.description).toBe(mockProject.description);
    expect(result.url).toBe(mockProject.url);
    expect(result.state).toBe(mockProject.state);
    expect(result.revision).toBe(mockProject.revision);
    expect(result.visibility).toBe(mockProject.visibility);
    expect(result.lastUpdateTime).toBe(mockProject.lastUpdateTime);
    expect(result.capabilities).toEqual(mockProject.capabilities);

    // Verify that additional details are not included
    expect(result.process).toBeUndefined();
    expect(result.teams).toBeUndefined();
  });

  test('should include teams when includeTeams is true', async () => {
    // Arrange
    const mockCoreApi: MockCoreApi = {
      getProject: jest.fn().mockResolvedValue(mockProject),
      getTeams: jest.fn().mockResolvedValue(mockTeams),
    };

    const mockConnection: MockConnection = {
      getCoreApi: jest.fn().mockResolvedValue(mockCoreApi),
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getWorkItemTypes: jest.fn().mockResolvedValue([]),
      }),
      getProcessApi: jest.fn().mockResolvedValue({
        getProcesses: jest.fn().mockResolvedValue([]),
        getProcessWorkItemTypes: jest.fn().mockResolvedValue([]),
      }),
    };

    // Act
    const result = await getProjectDetails(
      mockConnection as unknown as WebApi,
      {
        projectId: 'test-project',
        includeTeams: true,
      },
    );

    // Assert
    expect(result).toBeDefined();
    expect(result.teams).toBeDefined();
    expect(result.teams?.length).toBe(2);
    expect(result.teams?.[0].id).toBe(mockTeams[0].id);
    expect(result.teams?.[0].name).toBe(mockTeams[0].name);
    expect(result.teams?.[1].id).toBe(mockTeams[1].id);
    expect(result.teams?.[1].name).toBe(mockTeams[1].name);
  });

  test('should include process information when includeProcess is true', async () => {
    // Arrange
    const mockCoreApi: MockCoreApi = {
      getProject: jest.fn().mockResolvedValue(mockProject),
      getTeams: jest.fn().mockResolvedValue([]),
    };

    const mockWorkItemTrackingApi: MockWorkItemTrackingApi = {
      getWorkItemTypes: jest.fn().mockResolvedValue([]),
    };

    const mockConnection: MockConnection = {
      getCoreApi: jest.fn().mockResolvedValue(mockCoreApi),
      getWorkItemTrackingApi: jest
        .fn()
        .mockResolvedValue(mockWorkItemTrackingApi),
      getProcessApi: jest.fn(),
    };

    // Act
    const result = await getProjectDetails(
      mockConnection as unknown as WebApi,
      {
        projectId: 'test-project',
        includeProcess: true,
      },
    );

    // Assert
    expect(result).toBeDefined();
    expect(result.process).toBeDefined();
    expect(result.process?.name).toBe('Agile');
  });

  test('should include work item types when includeWorkItemTypes is true', async () => {
    // Arrange
    const mockCoreApi: MockCoreApi = {
      getProject: jest.fn().mockResolvedValue(mockProject),
      getTeams: jest.fn().mockResolvedValue([]),
    };

    const mockWorkItemTrackingApi: MockWorkItemTrackingApi = {
      getWorkItemTypes: jest.fn().mockResolvedValue(mockWorkItemTypes),
    };

    const mockProcessApi: MockProcessApi = {
      getProcesses: jest.fn().mockResolvedValue(mockProcesses),
      getProcessWorkItemTypes: jest
        .fn()
        .mockResolvedValue(mockProcessWorkItemTypes),
    };

    const mockConnection: MockConnection = {
      getCoreApi: jest.fn().mockResolvedValue(mockCoreApi),
      getWorkItemTrackingApi: jest
        .fn()
        .mockResolvedValue(mockWorkItemTrackingApi),
      getProcessApi: jest.fn().mockResolvedValue(mockProcessApi),
    };

    // Act
    const result = await getProjectDetails(
      mockConnection as unknown as WebApi,
      {
        projectId: 'test-project',
        includeWorkItemTypes: true,
        includeProcess: true,
      },
    );

    // Assert
    expect(result).toBeDefined();
    expect(result.process).toBeDefined();
    expect(result.process?.workItemTypes).toBeDefined();
    expect(result.process?.workItemTypes?.length).toBe(2);
    expect(result.process?.workItemTypes?.[0].name).toBe('User Story');
    expect(result.process?.workItemTypes?.[1].name).toBe('Bug');
  });

  test('should include fields when includeFields is true', async () => {
    // Arrange
    const mockCoreApi: MockCoreApi = {
      getProject: jest.fn().mockResolvedValue(mockProject),
      getTeams: jest.fn().mockResolvedValue([]),
    };

    const mockWorkItemTrackingApi: MockWorkItemTrackingApi = {
      getWorkItemTypes: jest.fn().mockResolvedValue(mockWorkItemTypes),
    };

    const mockProcessApi: MockProcessApi = {
      getProcesses: jest.fn().mockResolvedValue(mockProcesses),
      getProcessWorkItemTypes: jest
        .fn()
        .mockResolvedValue(mockProcessWorkItemTypes),
    };

    const mockConnection: MockConnection = {
      getCoreApi: jest.fn().mockResolvedValue(mockCoreApi),
      getWorkItemTrackingApi: jest
        .fn()
        .mockResolvedValue(mockWorkItemTrackingApi),
      getProcessApi: jest.fn().mockResolvedValue(mockProcessApi),
    };

    // Act
    const result = await getProjectDetails(
      mockConnection as unknown as WebApi,
      {
        projectId: 'test-project',
        includeWorkItemTypes: true,
        includeFields: true,
        includeProcess: true,
      },
    );

    // Assert
    expect(result).toBeDefined();
    expect(result.process).toBeDefined();
    expect(result.process?.workItemTypes).toBeDefined();
    expect(result.process?.workItemTypes?.[0].fields).toBeDefined();
    expect(result.process?.workItemTypes?.[0].fields?.length).toBe(2);
    expect(result.process?.workItemTypes?.[0].fields?.[0].name).toBe('Title');
    expect(result.process?.workItemTypes?.[0].fields?.[1].name).toBe(
      'Description',
    );
  });

  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: MockConnection = {
      getCoreApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
      getWorkItemTrackingApi: jest.fn(),
      getProcessApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      getProjectDetails(mockConnection as unknown as WebApi, {
        projectId: 'test-project',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      getProjectDetails(mockConnection as unknown as WebApi, {
        projectId: 'test-project',
      }),
    ).rejects.toThrow('Custom error');
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection: MockConnection = {
      getCoreApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
      getWorkItemTrackingApi: jest.fn(),
      getProcessApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      getProjectDetails(mockConnection as unknown as WebApi, {
        projectId: 'test-project',
      }),
    ).rejects.toThrow('Failed to get project details: Unexpected error');
  });
});

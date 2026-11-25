import type { WebApi } from 'azure-devops-node-api';
import type {
  TeamProject,
  WebApiTeam,
} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import type { WorkItemType } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { getProjectDetails } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

const mockProject = {
  id: 'project-id',
  name: 'Test Project',
  description: 'A test project',
  url: 'https://dev.azure.com/org/project',
  state: 1,
  revision: 123,
  visibility: 0,
  capabilities: {
    versioncontrol: { sourceControlType: 'Git' },
    processTemplate: {
      templateName: 'Agile',
      templateTypeId: 'template-guid',
    },
  },
} as unknown as TeamProject;

const mockTeams: WebApiTeam[] = [
  { id: 'team-1', name: 'Team 1', description: 'First team' },
  { id: 'team-2', name: 'Team 2', description: 'Second team' },
];

const mockWorkItemTypes: WorkItemType[] = [
  {
    name: 'User Story',
    description: 'Tracks user requirements',
    referenceName: 'Microsoft.VSTS.WorkItemTypes.UserStory',
  },
  {
    name: 'Bug',
    description: 'Tracks defects',
    referenceName: 'Microsoft.VSTS.WorkItemTypes.Bug',
  },
];

function createConnection(overrides?: {
  project?: TeamProject | null;
  teams?: WebApiTeam[];
  workItemTypes?: WorkItemType[];
  getWorkItemTypeFieldsWithReferences?: jest.Mock;
}) {
  const getProject = jest
    .fn()
    .mockResolvedValue(
      overrides && 'project' in overrides ? overrides.project : mockProject,
    );
  const getTeams = jest.fn().mockResolvedValue(overrides?.teams ?? []);
  const getWorkItemTypes = jest
    .fn()
    .mockResolvedValue(overrides?.workItemTypes ?? mockWorkItemTypes);
  const getWorkItemTypeFieldsWithReferences =
    overrides?.getWorkItemTypeFieldsWithReferences ??
    jest.fn().mockResolvedValue([]);

  const connection = {
    getCoreApi: jest.fn().mockResolvedValue({ getProject, getTeams }),
    getWorkItemTrackingApi: jest.fn().mockResolvedValue({
      getWorkItemTypes,
      getWorkItemTypeFieldsWithReferences,
    }),
  } as unknown as WebApi;

  return {
    connection,
    getProject,
    getTeams,
    getWorkItemTypes,
    getWorkItemTypeFieldsWithReferences,
  };
}

describe('getProjectDetails unit', () => {
  test('throws AzureDevOpsResourceNotFoundError when project is null', async () => {
    const { connection } = createConnection({ project: null });

    await expect(
      getProjectDetails(connection, { projectId: 'missing' }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  test('returns basic project details without fetching teams or work item types by default', async () => {
    const { connection, getTeams, getWorkItemTypes } = createConnection();

    const result = await getProjectDetails(connection, {
      projectId: 'test-project',
    });

    expect(result.id).toBe('project-id');
    expect(result.teams).toBeUndefined();
    expect(result.process).toBeUndefined();
    expect(getTeams).not.toHaveBeenCalled();
    expect(getWorkItemTypes).not.toHaveBeenCalled();
  });

  test('fetches teams and passes expandTeamIdentity when includeTeams is true', async () => {
    const { connection, getTeams } = createConnection({ teams: mockTeams });

    const result = await getProjectDetails(connection, {
      projectId: 'test-project',
      includeTeams: true,
      expandTeamIdentity: true,
    });

    expect(getTeams).toHaveBeenCalledWith('test-project', true);
    expect(result.teams).toEqual(mockTeams);
  });

  test('fetches type-specific fields from workItemTrackingApi when includeFields is true', async () => {
    const getWorkItemTypeFieldsWithReferences = jest
      .fn()
      .mockImplementation(async (_projectId: string, witName: string) =>
        witName === 'User Story'
          ? [
              {
                name: 'Story Points',
                referenceName: 'Microsoft.VSTS.Scheduling.StoryPoints',
                type: 'Double',
                isRequired: false,
                isIdentity: false,
                isPicklist: false,
              },
            ]
          : [
              {
                name: 'Repro Steps',
                referenceName: 'Microsoft.VSTS.TCM.ReproSteps',
                type: 'Html',
                isRequired: true,
              },
            ],
      );

    const { connection } = createConnection({
      getWorkItemTypeFieldsWithReferences,
    });

    const result = await getProjectDetails(connection, {
      projectId: 'test-project',
      includeProcess: true,
      includeWorkItemTypes: true,
      includeFields: true,
    });

    expect(getWorkItemTypeFieldsWithReferences).toHaveBeenCalledTimes(2);
    expect(getWorkItemTypeFieldsWithReferences).toHaveBeenCalledWith(
      'test-project',
      'User Story',
    );
    expect(getWorkItemTypeFieldsWithReferences).toHaveBeenCalledWith(
      'test-project',
      'Bug',
    );
    expect(result.process?.name).toBe('Agile');
    expect(result.process?.workItemTypes?.[0].fields).toEqual([
      expect.objectContaining({
        name: 'Story Points',
        referenceName: 'Microsoft.VSTS.Scheduling.StoryPoints',
        type: 'double',
        required: false,
      }),
    ]);
    expect(result.process?.workItemTypes?.[1].fields).toEqual([
      expect.objectContaining({
        name: 'Repro Steps',
        referenceName: 'Microsoft.VSTS.TCM.ReproSteps',
        type: 'html',
        required: true,
      }),
    ]);
    expect(
      result.process?.hierarchyInfo?.requirementBacklog?.workItemTypes,
    ).toEqual(['User Story', 'Bug']);
  });

  test('falls back to default Title/Description fields when fetching fields for a type fails', async () => {
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    try {
      const getWorkItemTypeFieldsWithReferences = jest
        .fn()
        .mockRejectedValue(new Error('permission denied'));
      const { connection } = createConnection({
        getWorkItemTypeFieldsWithReferences,
      });

      const result = await getProjectDetails(connection, {
        projectId: 'test-project',
        includeProcess: true,
        includeWorkItemTypes: true,
        includeFields: true,
      });

      expect(
        result.process?.workItemTypes?.[0].fields?.map((f) => f.name),
      ).toEqual(['Title', 'Description']);
      expect(stderrSpy).toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });

  test('propagates AzureDevOpsError and wraps unexpected errors', async () => {
    const adoErrConn = {
      getCoreApi: jest
        .fn()
        .mockRejectedValue(new AzureDevOpsError('Custom error')),
    } as unknown as WebApi;

    await expect(
      getProjectDetails(adoErrConn, { projectId: 'test-project' }),
    ).rejects.toThrow(AzureDevOpsError);

    const genericConn = {
      getCoreApi: jest.fn().mockRejectedValue(new Error('Unexpected error')),
    } as unknown as WebApi;

    await expect(
      getProjectDetails(genericConn, { projectId: 'test-project' }),
    ).rejects.toThrow('Failed to get project details: Unexpected error');
  });
});

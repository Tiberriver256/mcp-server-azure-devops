import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import type {
  TeamProject,
  WebApiTeam,
} from 'azure-devops-node-api/interfaces/CoreInterfaces.js';
import type { WorkItemType } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import { getProjectDetails } from './feature.ts';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors/index.ts';

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

type GetWorkItemTypeFieldsFn = (
  projectId: string,
  witName: string,
) => Promise<unknown[]>;

function createConnection(overrides?: {
  project?: TeamProject | null;
  teams?: WebApiTeam[];
  workItemTypes?: WorkItemType[];
  getWorkItemTypeFieldsWithReferences?: Mock<GetWorkItemTypeFieldsFn>;
}) {
  const getProject = mock.fn(() =>
    Promise.resolve(
      overrides && 'project' in overrides ? overrides.project : mockProject,
    ),
  );
  const getTeams = mock.fn(
    (_projectId: string, _expandTeamIdentity?: boolean) =>
      Promise.resolve(overrides?.teams ?? []),
  );
  const getWorkItemTypes = mock.fn((_projectId: string) =>
    Promise.resolve(overrides?.workItemTypes ?? mockWorkItemTypes),
  );
  const getWorkItemTypeFieldsWithReferences: Mock<GetWorkItemTypeFieldsFn> =
    overrides?.getWorkItemTypeFieldsWithReferences ??
    mock.fn<GetWorkItemTypeFieldsFn>(() => Promise.resolve([]));

  const connection = {
    getCoreApi: mock.fn(() => Promise.resolve({ getProject, getTeams })),
    getWorkItemTrackingApi: mock.fn(() =>
      Promise.resolve({
        getWorkItemTypes,
        getWorkItemTypeFieldsWithReferences,
      }),
    ),
  } as unknown as WebApi;

  return {
    connection,
    getProject,
    getTeams,
    getWorkItemTypes,
    getWorkItemTypeFieldsWithReferences,
  };
}

void describe('getProjectDetails unit', () => {
  void test('throws AzureDevOpsResourceNotFoundError when project is null', async () => {
    const { connection } = createConnection({ project: null });

    await assert.rejects(
      () => getProjectDetails(connection, { projectId: 'missing' }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void test('returns basic project details without fetching teams or work item types by default', async () => {
    const { connection, getTeams, getWorkItemTypes } = createConnection();

    const result = await getProjectDetails(connection, {
      projectId: 'test-project',
    });

    assert.strictEqual(result.id, 'project-id');
    assert.strictEqual(result.teams, undefined);
    assert.strictEqual(result.process, undefined);
    assert.strictEqual(getTeams.mock.callCount(), 0);
    assert.strictEqual(getWorkItemTypes.mock.callCount(), 0);
  });

  void test('fetches teams and passes expandTeamIdentity when includeTeams is true', async () => {
    const { connection, getTeams } = createConnection({ teams: mockTeams });

    const result = await getProjectDetails(connection, {
      projectId: 'test-project',
      includeTeams: true,
      expandTeamIdentity: true,
    });

    assert.strictEqual(getTeams.mock.callCount(), 1);
    assert.deepStrictEqual(getTeams.mock.calls[0]?.arguments, [
      'test-project',
      true,
    ]);
    assert.deepStrictEqual(result.teams, mockTeams);
  });

  void test('fetches type-specific fields from workItemTrackingApi when includeFields is true', async () => {
    const getWorkItemTypeFieldsWithReferences =
      mock.fn<GetWorkItemTypeFieldsFn>((_projectId, witName) =>
        Promise.resolve(
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
        ),
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

    assert.strictEqual(getWorkItemTypeFieldsWithReferences.mock.callCount(), 2);
    assert.deepStrictEqual(
      getWorkItemTypeFieldsWithReferences.mock.calls.map(
        (call) => call.arguments,
      ),
      [
        ['test-project', 'User Story'],
        ['test-project', 'Bug'],
      ],
    );
    assert.strictEqual(result.process?.name, 'Agile');

    const storyFields = result.process?.workItemTypes?.[0].fields;
    assert.ok(storyFields);
    assert.strictEqual(storyFields.length, 1);
    assert.partialDeepStrictEqual(storyFields[0], {
      name: 'Story Points',
      referenceName: 'Microsoft.VSTS.Scheduling.StoryPoints',
      type: 'double',
      required: false,
    });

    const bugFields = result.process?.workItemTypes?.[1].fields;
    assert.ok(bugFields);
    assert.strictEqual(bugFields.length, 1);
    assert.partialDeepStrictEqual(bugFields[0], {
      name: 'Repro Steps',
      referenceName: 'Microsoft.VSTS.TCM.ReproSteps',
      type: 'html',
      required: true,
    });

    assert.deepStrictEqual(
      result.process?.hierarchyInfo?.requirementBacklog?.workItemTypes,
      ['User Story', 'Bug'],
    );
  });

  void test('falls back to default Title/Description fields when fetching fields for a type fails', async () => {
    const stderrSpy = mock.method(process.stderr, 'write', () => true);
    try {
      const getWorkItemTypeFieldsWithReferences =
        mock.fn<GetWorkItemTypeFieldsFn>(() =>
          Promise.reject(new Error('permission denied')),
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

      assert.deepStrictEqual(
        result.process?.workItemTypes?.[0].fields?.map((f) => f.name),
        ['Title', 'Description'],
      );
      assert.ok(stderrSpy.mock.callCount() >= 1);
    } finally {
      stderrSpy.mock.restore();
    }
  });

  void test('propagates AzureDevOpsError and wraps unexpected errors', async () => {
    const adoErrConn = {
      getCoreApi: mock.fn(() =>
        Promise.reject(new AzureDevOpsError('Custom error')),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () => getProjectDetails(adoErrConn, { projectId: 'test-project' }),
      AzureDevOpsError,
    );

    const genericConn = {
      getCoreApi: mock.fn(() => Promise.reject(new Error('Unexpected error'))),
    } as unknown as WebApi;

    await assert.rejects(
      () => getProjectDetails(genericConn, { projectId: 'test-project' }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Failed to get project details: Unexpected error',
        );
        return true;
      },
    );
  });
});
